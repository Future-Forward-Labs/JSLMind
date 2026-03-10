package com.jslmind.workflows;

import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.util.Map;

@WorkflowInterface
public interface CBMWorkflow {
    @WorkflowMethod
    void execute(Map<String, Object> anomalyEvent);

    @SignalMethod
    void approveMaintenanceSchedule();
}
