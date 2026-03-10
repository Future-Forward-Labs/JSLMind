package com.jslmind.workflows;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;
import java.util.Map;

@ActivityInterface
public interface CBMActivities {
    @ActivityMethod String detectAnomaly(Map<String, Object> event);
    @ActivityMethod double scoreConfidence(String anomalyId, Map<String, Object> event);
    @ActivityMethod String createSAPNotification(String anomalyId, double confidence, Map<String, Object> event);
    @ActivityMethod void scheduleMaintenance(String sapNotificationId, String equipmentId);
}
