package com.jslmind.workflows;

import io.temporal.client.WorkflowClient;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;

public class CBMWorker {
    public static void main(String[] args) throws InterruptedException {
        String address = System.getenv().getOrDefault("TEMPORAL_ADDRESS", "localhost:7233");
        WorkflowServiceStubs service = WorkflowServiceStubs.newServiceStubs(
            WorkflowServiceStubsOptions.newBuilder().setTarget(address).build()
        );
        WorkflowClient client   = WorkflowClient.newInstance(service);
        WorkerFactory  factory  = WorkerFactory.newInstance(client);
        Worker         worker   = factory.newWorker("cbm-task-queue");

        worker.registerWorkflowImplementationTypes(CBMWorkflowImpl.class);
        worker.registerActivitiesImplementations(new CBMActivitiesImpl());

        factory.start();
        System.out.println("[CBM Worker] Listening on cbm-task-queue @ " + address);
        Thread.currentThread().join();
    }
}
