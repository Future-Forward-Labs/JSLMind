package com.jslmind.workflows;

import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Workflow;
import java.time.Duration;
import java.util.Map;

public class CBMWorkflowImpl implements CBMWorkflow {

    private boolean approved = false;

    private final CBMActivities activities = Workflow.newActivityStub(
        CBMActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(5))
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(3).build())
            .build()
    );

    @Override
    public void execute(Map<String, Object> event) {
        String equipment = (String) event.getOrDefault("equipment_id", "UNKNOWN");

        String anomalyId  = activities.detectAnomaly(event);
        double confidence = activities.scoreConfidence(anomalyId, event);
        String sapId      = activities.createSAPNotification(anomalyId, confidence, event);

        // Human-in-loop: wait up to 24h for maintenance manager approval
        Workflow.await(Duration.ofHours(24), () -> approved);

        if (approved) {
            activities.scheduleMaintenance(sapId, equipment);
        }
    }

    @Override
    public void approveMaintenanceSchedule() {
        this.approved = true;
    }
}
