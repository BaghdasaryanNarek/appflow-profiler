"""Discrete simulation engine synthesizing host processes and sockets (Master Plan §5.3)."""

import random
from collections import defaultdict
from datetime import UTC, datetime

from appflow.domain.enums import MetricQuality, NodeKind
from appflow.domain.models import ScenarioInfo
from appflow.simulation.blueprint import Blueprint, ProcessInstance, create_default_blueprint
from appflow.simulation.queueing import (
    compute_connections_and_states,
    compute_error_rate,
    compute_percentiles,
    compute_total_latency,
    compute_waiting_time,
)
from appflow.simulation.scenarios import ScenarioManager
from appflow.simulation.traffic import TrafficGenerator
from appflow.sources.base import RawConnection, RawProcessSample, RawSample


class SimulationEngine:
    """Discrete-time simulation engine generating realistic telemetry for the demo platform."""

    def __init__(
        self,
        blueprint: Blueprint | None = None,
        seed: int = 42,
        scale: float = 1.0,
        autoplay: bool = True,
    ) -> None:
        self.blueprint: Blueprint = blueprint or create_default_blueprint()
        self.seed = seed
        self.scale = max(0.1, scale)
        self.rng = random.Random(seed)
        self.traffic = TrafficGenerator(seed=seed)
        self.scenarios = ScenarioManager(autoplay=autoplay)

        self.processes: list[ProcessInstance] = self.blueprint.get_expanded_processes(
            scale=self.scale
        )
        self.service_processes: dict[str, list[ProcessInstance]] = defaultdict(list)
        for proc in self.processes:
            self.service_processes[proc.service_id].append(proc)

        self.service_backlogs: dict[str, float] = defaultdict(float)
        self.service_retry_traffic: dict[str, float] = defaultdict(float)
        self.process_rss: dict[int, int] = {}
        self.current_time: float = 0.0

        # Prime initial process memory sizes (120MB - 240MB)
        for proc in self.processes:
            self.process_rss[proc.pid] = int(self.rng.uniform(120, 240) * 1024 * 1024)

    @property
    def active_scenario(self) -> ScenarioInfo | None:
        """Currently active anomaly scenario if any."""
        return self.scenarios.active_scenario_info

    def reset(self) -> None:
        """Reset engine, traffic, and scenarios to initial baseline."""
        self.current_time = 0.0
        self.rng = random.Random(self.seed)
        self.traffic.reset(self.seed)
        self.scenarios.reset()
        self.service_backlogs.clear()
        self.service_retry_traffic.clear()

        for proc in self.processes:
            self.process_rss[proc.pid] = int(self.rng.uniform(120, 240) * 1024 * 1024)

    def step(self, dt: float = 1.0) -> RawSample:
        """Advance simulation by dt seconds and synthesize a comprehensive RawSample."""
        self.current_time += dt

        # 1. Advance scenario state and decay bursts
        self.scenarios.tick(dt, self)
        self.traffic.step(dt)

        # 2. Forward pass: compute incoming traffic rates lambda_in in topological order
        service_lambda_in: dict[str, float] = defaultdict(float)
        client_rate = self.traffic.get_rate(self.current_time)
        service_lambda_in["client-edge"] = client_rate

        for s_id in self.blueprint.topological_order:
            service = self.blueprint.services[s_id]
            curr_lam = service_lambda_in[s_id]

            # Add retried traffic from previous tick failures
            curr_lam += self.service_retry_traffic[s_id]
            self.service_retry_traffic[s_id] = 0.0
            service_lambda_in[s_id] = curr_lam

            # Propagate to downstream calls
            for edge in service.downstream_calls:
                prob = self.scenarios.apply_cache_miss_modifier(edge.target_id, edge.probability)
                flow = curr_lam * edge.fanout * prob
                service_lambda_in[edge.target_id] += flow

        # 3. Compute per-service capacity, backlogs, and utilization rho
        service_rho: dict[str, float] = {}
        service_mu: dict[str, float] = {}
        service_instances: dict[str, int] = {}

        for s_id, service in self.blueprint.services.items():
            inst_count = max(1, round(service.base_instances * self.scale))
            service_instances[s_id] = inst_count
            mu_eff = self.scenarios.apply_service_rate_modifier(s_id, service.service_rate)
            service_mu[s_id] = mu_eff

            capacity = inst_count * mu_eff
            lam = service_lambda_in[s_id]

            # Backlog queue dynamics: accumulate excess, drain on idle
            if lam > capacity:
                excess = (lam - capacity) * dt
                self.service_backlogs[s_id] += excess
            elif self.service_backlogs[s_id] > 0.0 and capacity > lam:
                drain = min(self.service_backlogs[s_id], (capacity - lam) * dt)
                self.service_backlogs[s_id] -= drain

            backlog_rate = self.service_backlogs[s_id] / max(1e-3, dt)
            effective_lam = lam + backlog_rate
            rho = effective_lam / max(1e-3, capacity) if capacity > 0 else 1.0
            service_rho[s_id] = min(0.999, max(0.0, rho))

        # 4. Reverse pass: compute response times W and error rates backwards
        service_w_ms: dict[str, float] = {}
        service_p50_ms: dict[str, float] = {}
        service_p99_ms: dict[str, float] = {}
        service_errors: dict[str, float] = {}

        for s_id in reversed(self.blueprint.topological_order):
            service = self.blueprint.services[s_id]
            c = service_instances[s_id]
            mu = service_mu[s_id]
            lam = service_lambda_in[s_id]
            backlog = self.service_backlogs[s_id]

            # Waiting time in queue
            w_q_s = compute_waiting_time(c, mu, lam, backlog)

            # Sum downstream synchronous latencies
            downstream_sync_ms = 0.0
            for edge in service.downstream_calls:
                if edge.is_sync:
                    target_lat = service_w_ms.get(edge.target_id, 5.0)
                    downstream_sync_ms += target_lat * edge.probability

            base_lat = self.scenarios.apply_latency_modifier(s_id, service.base_latency_ms)
            w_total_ms = compute_total_latency(base_lat, w_q_s, mu, downstream_sync_ms)
            p50, p99 = compute_percentiles(w_total_ms, self.rng, apply_jitter=True)

            service_w_ms[s_id] = w_total_ms
            service_p50_ms[s_id] = p50
            service_p99_ms[s_id] = p99

            rho = service_rho[s_id]
            err_rate = compute_error_rate(rho, w_total_ms, service.timeout_ms)
            service_errors[s_id] = err_rate

            # Retry amplification: failed calls generate retries for downstream in next tick
            if service.retry_probability > 0.0 and err_rate > 0.0:
                retried_reqs = lam * err_rate * service.retry_probability
                for edge in service.downstream_calls:
                    prob = self.scenarios.apply_cache_miss_modifier(
                        edge.target_id, edge.probability
                    )
                    self.service_retry_traffic[edge.target_id] += retried_reqs * edge.fanout * prob

        # 5. Synthesize RawProcessSample for all active processes
        process_samples: dict[int, RawProcessSample] = {}
        process_open_conns: dict[int, int] = defaultdict(int)

        # 6. Synthesize RawConnection records between callers and targets
        raw_connections: list[RawConnection] = []
        is_db_exhausted = (
            self.scenarios.state == "scenario"
            and self.scenarios.active_scenario is not None
            and self.scenarios.active_scenario.id == "db-pool-exhaustion"
        )

        for s_id, service in self.blueprint.services.items():
            caller_procs = self.service_processes.get(s_id, [])
            caller_pid = caller_procs[0].pid if caller_procs else None

            for edge in service.downstream_calls:
                target_service = self.blueprint.services.get(edge.target_id)
                target_procs = self.service_processes.get(edge.target_id, [])
                target_pid = target_procs[0].pid if target_procs else None
                target_port = target_procs[0].port if target_procs else 80

                edge_lam = service_lambda_in[s_id] * edge.fanout * edge.probability
                edge_lat_s = service_w_ms.get(edge.target_id, 10.0) / 1000.0

                exhausted = is_db_exhausted and edge.target_id == "svc:postgres-primary"
                conn_count, state_breakdown = compute_connections_and_states(
                    edge_lam,
                    edge_lat_s,
                    pool_size=service.pool_size,
                    is_exhausted=exhausted,
                )

                if caller_pid is not None:
                    process_open_conns[caller_pid] += conn_count
                if target_pid is not None:
                    process_open_conns[target_pid] += conn_count

                # Create synthesized connection observation
                laddr_ip = "127.0.0.1"
                is_ext = target_service and target_service.kind == NodeKind.EXTERNAL
                raddr_ip = "10.0.0.1" if is_ext else "127.0.0.1"

                for state, count in state_breakdown.items():
                    if count <= 0:
                        continue
                    raw_connections.append(
                        RawConnection(
                            laddr_ip=laddr_ip,
                            laddr_port=caller_procs[0].port if caller_procs else 50000,
                            raddr_ip=raddr_ip,
                            raddr_port=target_port,
                            status=state,
                            protocol=edge.protocol,
                            pid=caller_pid,
                        )
                    )

        # Build ProcessSample objects
        for proc in self.processes:
            s_id = proc.service_id
            service = self.blueprint.services[s_id]
            rho = service_rho.get(s_id, 0.05)
            lam = service_lambda_in.get(s_id, 0.0)
            inst_count = service_instances.get(s_id, 1)

            # CPU percentage: rho * 100 * cores + small jitter
            cpu_jitter = self.rng.gauss(0.0, 1.5)
            cpu = max(0.5, (rho * 100.0 * service.cores_per_instance) + cpu_jitter)

            # RSS bytes: slow walk with GC sawtooth
            rss = self.process_rss[proc.pid]
            rss += int(self.rng.gauss(30_000, 15_000))
            if rss > 380 * 1024 * 1024:
                # GC drops heap
                rss = int(rss * 0.55)
            rss = max(64 * 1024 * 1024, rss)
            self.process_rss[proc.pid] = rss

            open_conns = process_open_conns[proc.pid]
            io_bps = (lam / inst_count) * 1024.0

            process_samples[proc.pid] = RawProcessSample(
                pid=proc.pid,
                name=proc.name,
                cmdline_sanitized=proc.cmdline,
                create_time=proc.create_time,
                cpu_percent=round(cpu, 1),
                rss_bytes=rss,
                open_connections=open_conns,
                num_threads=max(4, min(64, int(4 + open_conns * 0.2))),
                io_bytes_per_sec=round(io_bps, 1),
            )

        return RawSample(
            timestamp=datetime.now(UTC),
            connections=raw_connections,
            processes=process_samples,
            quality=MetricQuality.SIMULATED,
        )
