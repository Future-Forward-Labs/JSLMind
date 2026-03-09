package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * FileToQdrantRoute — Phase 4: Hybrid RAG document ingestion
 *
 * Watches a local directory for new PDF / Word / Excel files.
 * On new file: builds an ingest request body and POSTs to the RAG service.
 *
 * Demo: drag any file into rag/docs/incoming/ and it auto-indexes within 5 seconds.
 *
 * Production story: replace file:// with SharePoint Graph API poller —
 * same downstream behaviour, zero code change in downstream routes.
 */
@Component
public class FileToQdrantRoute extends RouteBuilder {

    @Value("${rag.watch.dir:/docs/incoming}")
    private String watchDir;

    @Value("${rag.ingest.url:http://rag-service:8001/ingest}")
    private String ragIngestUrl;

    @Override
    public void configure() {
        // Error handling: log and continue — don't kill the route on one bad file
        onException(Exception.class)
            .log("FileToQdrantRoute ERROR: ${exception.message}")
            .handled(true);

        from("file://" + watchDir
                + "?include=.*\\.(pdf|docx|doc|xlsx|txt)"
                + "&noop=true"           // leave file in place (noop=true means don't move/delete)
                + "&initialDelay=5000"   // 5s startup delay
                + "&delay=5000"          // poll every 5s
                + "&idempotent=true"     // skip already-seen files
                + "&readLock=changed"    // wait until file is fully written
            )
            .routeId("file-to-qdrant")
            .log("FileToQdrantRoute: detected new file → ${header.CamelFileName}")

            // Build JSON body: {"file_path": "/docs/incoming/<filename>"}
            .process(exchange -> {
                String fileName = exchange.getIn().getHeader(
                    "CamelFileName", String.class);
                String filePath = watchDir + "/" + fileName;
                exchange.getIn().setBody(
                    "{\"file_path\": \"" + filePath + "\"}"
                );
                exchange.getIn().setHeader("Content-Type", "application/json");
            })

            .to("http://" + ragIngestUrl.replace("http://", "")
                    + "?httpMethod=POST"
                    + "&throwExceptionOnFailure=true")

            .log("FileToQdrantRoute: ✓ indexed ${header.CamelFileName} → ${body}");
    }
}
