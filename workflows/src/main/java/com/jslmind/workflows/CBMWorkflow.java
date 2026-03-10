package com.jslmind.workflows;

import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.util.Map;

@WorkflowInterface
public interface CBMWorkflow {

    /** Triggered by the first anomaly on an equipment unit. */
    @WorkflowMethod
    void execute(Map<String, Object> triggerEvent);

    /**
     * Called for every subsequent anomaly on the same equipment within the
     * correlation window. Allows the workflow to reason across multiple
     * simultaneous sensor deviations (e.g. bearing_temp + vibration +
     * motor_current → bearing failure pattern).
     */
    @SignalMethod
    void addCorrelatedAnomaly(Map<String, Object> anomaly);

    /** Sent by a maintenance manager to approve the scheduled work order. */
    @SignalMethod
    void approveMaintenanceSchedule();
}
