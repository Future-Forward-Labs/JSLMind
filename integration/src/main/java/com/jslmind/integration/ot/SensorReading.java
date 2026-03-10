package com.jslmind.integration.ot;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SensorReading(
    @JsonProperty("equipment_id")   String equipmentId,
    @JsonProperty("equipment_desc") String equipmentDesc,
    @JsonProperty("line_id")        String lineId,
    @JsonProperty("plant")          String plant,
    @JsonProperty("tag")            String tag,
    @JsonProperty("value")          double value,
    @JsonProperty("unit")           String unit,
    @JsonProperty("timestamp")      String timestamp,
    @JsonProperty("anomaly_injected") boolean anomalyInjected
) {}
