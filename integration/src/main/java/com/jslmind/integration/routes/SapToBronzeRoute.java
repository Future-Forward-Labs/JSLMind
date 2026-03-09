package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

/**
 * SapToBronzeRoute — Phase 2: Medallion Pipeline
 * Polls simulated SAP MM data and lands it in MinIO Bronze bucket.
 * Implemented in Phase 2 (Medallion) sprint — stub only here.
 */
@Component
public class SapToBronzeRoute extends RouteBuilder {
    @Override
    public void configure() {
        from("timer:sap-poll?period=60000&delay=30000")
            .routeId("sap-to-bronze")
            .log("SapToBronzeRoute: SAP poll tick (stub — implement in Phase 2)");
    }
}
