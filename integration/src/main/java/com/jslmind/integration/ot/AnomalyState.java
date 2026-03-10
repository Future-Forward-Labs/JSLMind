package com.jslmind.integration.ot;

/** Welford's online algorithm state for incremental mean + variance. */
public class AnomalyState {
    public long count = 0;
    public double mean = 0.0;
    public double m2   = 0.0;   // sum of squared deviations

    public void update(double value) {
        count++;
        double delta = value - mean;
        mean += delta / count;
        m2   += delta * (value - mean);
    }

    public double stddev() {
        return count < 2 ? 0.0 : Math.sqrt(m2 / (count - 1));
    }

    public double zScore(double value) {
        double sd = stddev();
        return sd == 0.0 ? 0.0 : Math.abs(value - mean) / sd;
    }
}
