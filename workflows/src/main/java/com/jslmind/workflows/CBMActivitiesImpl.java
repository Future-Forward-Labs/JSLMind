package com.jslmind.workflows;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;
import java.util.UUID;

public class CBMActivitiesImpl implements CBMActivities {

    private static final Logger log = LoggerFactory.getLogger(CBMActivitiesImpl.class);

    @Override
    public String detectAnomaly(Map<String, Object> event) {
        String id = "ANOM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        log.info("[CBM] Anomaly detected: {} | equipment={} tag={} value={} z_score={}",
            id, event.get("equipment_id"), event.get("tag"),
            event.get("value"), event.get("z_score"));
        return id;
    }

    @Override
    public double scoreConfidence(String anomalyId, Map<String, Object> event) {
        double zScore = ((Number) event.getOrDefault("z_score", 3.0)).doubleValue();
        // Map z-score to 0-100% confidence (sigmoid-like scaling)
        double confidence = Math.min(0.99, 1.0 - Math.exp(-(zScore - 3.0) / 1.5));
        log.info("[CBM] {} confidence={:.1f}% (z={:.2f})",
            anomalyId,
            String.format("%.1f", confidence * 100),
            String.format("%.2f", zScore));
        return confidence;
    }

    @Override
    public String createSAPNotification(String anomalyId, double confidence, Map<String, Object> event) {
        // DEMO: stub — production fires Camel temporal-to-sap-pm route (SAP PM-03 / PM-01)
        String equipment = (String) event.getOrDefault("equipment_id", "UNKNOWN");
        String priority  = confidence > 0.9 ? "PM-01" : "PM-03";
        String notifId   = priority + "-" + System.currentTimeMillis();
        log.info("[CBM] SAP {} notification created: {} for {} (confidence={}%)",
            priority, notifId, equipment, String.format("%.1f", confidence * 100));
        return notifId;
    }

    @Override
    public void scheduleMaintenance(String sapNotificationId, String equipmentId) {
        log.info("[CBM] Maintenance scheduled: SAP={} equipment={}", sapNotificationId, equipmentId);
    }
}
