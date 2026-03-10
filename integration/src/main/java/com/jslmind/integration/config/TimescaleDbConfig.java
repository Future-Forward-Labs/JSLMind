package com.jslmind.integration.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

import javax.sql.DataSource;
import java.util.Map;

@Configuration
public class TimescaleDbConfig {

    @Bean("timescaleDataSource")
    public DataSource timescaleDataSource(
            @Value("${timescaledb.url}") String url,
            @Value("${timescaledb.username:postgres}") String username,
            @Value("${timescaledb.password}") String password) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(url);
        cfg.setUsername(username);
        cfg.setPassword(password);
        cfg.setMaximumPoolSize(5);
        cfg.setPoolName("timescale-pool");
        return new HikariDataSource(cfg);
    }

    @Bean("sensorKafkaListenerFactory")
    public ConcurrentKafkaListenerContainerFactory<String, String> sensorKafkaListenerFactory(
            @Value("${kafka.brokers:redpanda:29092}") String brokers) {
        ConsumerFactory<String, String> cf = new DefaultKafkaConsumerFactory<>(Map.of(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, brokers,
            ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
            ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class
        ));
        var factory = new ConcurrentKafkaListenerContainerFactory<String, String>();
        factory.setConsumerFactory(cf);
        return factory;
    }
}
