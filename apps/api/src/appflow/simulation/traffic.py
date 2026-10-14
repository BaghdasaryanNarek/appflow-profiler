"""Traffic generator with diurnal modulation and Hawkes process (Master Plan §5.3.1)."""

import math
import random


class HawkesProcess:
    """Self-exciting point process modeling transient load spikes and request storms."""

    def __init__(self, beta: float = 0.05) -> None:
        self.beta = beta  # Exponential decay rate (~20s half-life for 60s storms)
        self.intensity: float = 0.0

    def trigger_burst(self, alpha: float = 5.0) -> None:
        """Inject a shock/burst into the self-exciting process."""
        self.intensity += alpha

    def step(self, dt: float) -> None:
        """Advance time and apply exponential decay to excitation intensity."""
        if self.intensity > 0.0:
            self.intensity *= math.exp(-self.beta * dt)
            if self.intensity < 1e-4:
                self.intensity = 0.0

    @property
    def multiplier(self) -> float:
        """Relative load multiplier (1.0 = baseline, peaks ~6.0x during bursts)."""
        return 1.0 + self.intensity

    def reset(self) -> None:
        """Reset excitation to quiescent state."""
        self.intensity = 0.0


class TrafficGenerator:
    """Generates synthetic client traffic rates and discrete Poisson arrival samples."""

    def __init__(
        self,
        base_rate: float = 120.0,
        diurnal_amplitude: float = 0.35,
        t_day: float = 600.0,
        seed: int = 42,
    ) -> None:
        self.base_rate = base_rate
        self.diurnal_amplitude = diurnal_amplitude
        self.t_day = t_day  # 10 minutes (600s) compressed 24-hour cycle
        self.rng = random.Random(seed)
        self.hawkes = HawkesProcess()

    def get_rate(self, t: float, scenario_multiplier: float = 1.0) -> float:
        """Calculate continuous arrival rate lambda_0(t) in requests/second."""
        # Diurnal sinusoidal cycle: lambda_base * (1 + A * sin(2*pi*t / T_day))
        diurnal = 1.0 + self.diurnal_amplitude * math.sin((2.0 * math.pi * t) / self.t_day)
        rate = self.base_rate * diurnal * self.hawkes.multiplier * scenario_multiplier
        return max(0.0, rate)

    def sample_arrivals(self, rate: float, dt: float) -> int:
        """Sample integer request count from Poisson distribution with mean lambda * dt."""
        mean = rate * dt
        if mean <= 0.0:
            return 0

        # Knuth's algorithm for small means
        if mean < 30.0:
            threshold = math.exp(-mean)
            k = 0
            p = 1.0
            while p > threshold:
                k += 1
                p *= self.rng.random()
            return k - 1

        # Gaussian approximation with continuity correction for large means
        sample = self.rng.gauss(mean, math.sqrt(mean))
        return max(0, round(sample))

    def step(self, dt: float) -> None:
        """Advance internal process state."""
        self.hawkes.step(dt)

    def reset(self, seed: int | None = None) -> None:
        """Reset generator and Hawkes state with optional new seed."""
        if seed is not None:
            self.rng = random.Random(seed)
        self.hawkes.reset()
