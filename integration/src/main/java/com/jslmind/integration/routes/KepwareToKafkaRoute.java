package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

@Component
public class KepwareToKafkaRoute extends RouteBuilder {

    @Override
    public void configure() {
        // Subscribe to all equipment tags: jsl/plant/sensors/#
        from("paho-mqtt5:jsl/plant/sensors/#"
                + "?brokerUrl=tcp://{{mqtt.broker.host:mosquitto}}:{{mqtt.broker.port:1883}}"
                + "&clientId=camel-kepware-consumer"
                + "&cleanStart=true")
            .routeId("kepware-to-kafka")
            .log("OT tag received: ${header.CamelMqttTopic}")
            // Forward verbatim — payload is already enriched JSON from simulator
            .to("kafka:plant.sensors"
                + "?brokers={{kafka.brokers:redpanda:29092}}"
                + "&valueSerializer=org.apache.kafka.common.serialization.StringSerializer");
    }
}
