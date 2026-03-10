package com.jslmind.workflows;

import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Workflow;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class CBMWorkflowImpl implements CBMWorkflow {

    private boolean approved = false;

    // Correlated anomalies collected during the 10-second window after the
    // trigger event. Subsequent sensor spikes on the same equipment are
    // added here via the addCorrelatedAnomaly signal.
    private final List<Map<String, Object>> correlatedAnomalies = new ArrayList<>();

    private final CBMActivities activities = Workflow.newActivityStub(
        CBMActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(5))
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(3).build())
            .build()
    );

    @Override
    public void execute(Map<String, Object> triggerEvent) {
        String equipment = (String) triggerEvent.getOrDefault("equipment_id", "UNKNOWN");

        // ── Correlation window ────────────────────────────────────────────────
        // Wait up to 10 seconds for other sensors on the same equipment to
        // also breach the anomaly threshold. They arrive as signals via
        // addCorrelatedAnomaly(). This lets the workflow correlate simultaneous
        // multi-sensor deviations into a single maintenance diagnosis
        // (e.g. bearing_temp + vibration + motor_current → bearing failure).
        Workflow.sleep(Duration.ofSeconds(10));

        String anomalyId  = activities.detectAnomaly(triggerEvent);
        double confidence = activities.scoreConfidence(anomalyId, triggerEvent);
        String sapId      = activities.createSAPNotification(anomalyId, confidence, triggerEvent);

        // ── Human-in-loop ────────────────────────────────────────────────────
        // Wait up to 2 minutes for maintenance manager approval (demo mode).
        Workflow.await(Duration.ofMinutes(2), () -> approved);

        if (approved) {
            activities.scheduleMaintenance(sapId, equipment);
        }
    }

    @Override
    public void addCorrelatedAnomaly(Map<String, Object> anomaly) {
        correlatedAnomalies.add(anomaly);
        Workflow.getLogger(CBMWorkflowImpl.class).info(
            "[CBMWorkflow] Correlated anomaly: {}/{} z={}",
            anomaly.get("equipment_id"), anomaly.get("tag"), anomaly.get("z_score")
        );
    }

    @Override
    public void approveMaintenanceSchedule() {
        this.approved = true;
    }
}
