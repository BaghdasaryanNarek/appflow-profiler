# AppFlow Profiler: Simulation Engine Architecture & Mathematical Foundations

This document provides the complete mathematical and architectural specification for the deterministic simulation engine powering AppFlow Profiler's demonstration and test modes (`ENV=demo` and `ENV=test`), as mandated by §5 of `docs/MASTER_PLAN.md`.

---

## 1. Architectural Overview

The simulation engine synthesizes high-fidelity distributed system telemetry without requiring root privileges or physical socket observation. It generates:
- End-to-end directed topology graphs across services, datastores, message queues, caches, and external APIs.
- Synthetic OS processes with deterministic identifiers (`proc:<pid>:<epoch_ms>`), realistic CPU utilization, thread counts, and resident set size (RSS) memory with garbage-collection sawtooth behavior.
- In-flight TCP socket connections mapped to standard lifecycle states (`ESTABLISHED`, `TIME_WAIT`, `CLOSE_WAIT`) based on queueing theory.
- Injected failure modes (request storms, pool exhaustion, cache stampedes, dependency slowdowns) with automated cycling and self-healing recovery.

---

## 2. Exogenous Arrival Processes

Edge client traffic arriving at the ingress boundary (`client-edge`) is generated via a modulated non-homogeneous arrival model combined with a self-exciting point process.

### 2.1 Diurnal Modulation

Traffic exhibits a smooth cyclic pattern representing daily usage fluctuations, compressed to a 10-minute cycle ($T_{\text{day}} = 600\text{ s}$) for interactive demo responsiveness:

$$\lambda_0(t) = \lambda_{\text{base}} \cdot \left(1 + A \cdot \sin\left(\frac{2\pi t}{T_{\text{day}}}\right)\right) \cdot \text{storm}(t)$$

Where:
- $\lambda_{\text{base}} = 120.0\text{ req/s}$ is the baseline ingress arrival rate.
- $A = 0.35$ is the diurnal modulation amplitude ($[0.65, 1.35] \times \lambda_{\text{base}}$).
- $T_{\text{day}} = 600.0\text{ s}$ is the period of the diurnal wave.
- $\text{storm}(t)$ is the multiplier produced by the Hawkes self-exciting process.

### 2.2 Hawkes Self-Exciting Point Process

Transient bursts and traffic shocks (such as marketing flash sales or DDoS surges) are modeled via a univariate Hawkes process:

$$\text{storm}(t) = 1.0 + \sum_{t_i < t} \alpha \cdot e^{-\beta (t - t_i)}$$

Where:
- $\alpha = 5.0$ is the impulse amplitude injected at the start of a storm.
- $\beta = 0.05\text{ s}^{-1}$ governs the exponential decay rate (half-life $t_{1/2} = \frac{\ln 2}{\beta} \approx 13.86\text{ s}$).
- During quiescent steady-state operation, $\text{storm}(t) = 1.0$; during an active flash crowd, the intensity jumps to peak at approximately $6.0\times$ baseline.

### 2.3 Discrete Poisson Sampling

At each discrete simulation tick $\Delta t$, the integer number of discrete requests $N(t, \Delta t)$ is sampled from a Poisson distribution with mean $\mu_N = \lambda_0(t) \cdot \Delta t$:

$$P(N = k) = \frac{(\lambda_0 \Delta t)^k e^{-\lambda_0 \Delta t}}{k!}$$

- For $\mu_N < 30.0$: Exact sampling via Knuth's multiplicative inverse transform algorithm.
- For $\mu_N \ge 30.0$: High-performance Gaussian approximation with continuity correction: $\mathcal{N}(\mu_N, \mu_N)$.

---

## 3. Dependency DAG & Traffic Propagation

The microservice topology is modeled as a Directed Acyclic Graph (DAG) validated at initialization. Traffic flows downstream in topological order:

$$\lambda_j = \sum_{i \in \text{Upstream}(j)} \lambda_i \cdot k_{ij} \cdot p_{ij} + \lambda_{\text{retry}, j}$$

Where:
- $k_{ij}$ is the fan-out multiplier from caller $i$ to callee $j$.
- $p_{ij} \in [0.0, 1.0]$ is the invocation probability (e.g. cache miss probability).
- $\lambda_{\text{retry}, j}$ is the retry amplification load injected into service $j$ from previous tick failures.

---

## 4. M/M/c Multi-Server Queueing Model

Each service $s$ is modeled as an $M/M/c$ queueing system with $c$ parallel instances, each operating with service capacity $\mu$ requests/second.

### 4.1 Traffic Intensity & Utilization

$$\text{Offered Load } a = \frac{\lambda}{\mu}, \qquad \text{Server Utilization } \rho = \frac{a}{c} = \frac{\lambda}{c \mu}$$

To guarantee numerical stability when $\rho \ge 1.0$ (overload), the stationary formula clamps effective utilization to $\rho_{\text{eff}} = \min(\rho, 0.999)$. Excess load accumulates in an explicit backlog queue:

$$Q(t + \Delta t) = \max\left(0, Q(t) + (\lambda - c \mu) \cdot \Delta t\right)$$

### 4.2 Numerically Stable Erlang C Formulation

Rather than evaluating large factorials, the probability of queueing $C(c, a)$ is computed iteratively via the Erlang B loss formula recurrence:

$$B(0, a) = 1.0, \qquad B(k, a) = \frac{a \cdot B(k-1, a)}{k + a \cdot B(k-1, a)} \quad \text{for } k = 1, \dots, c$$

The Erlang C wait probability is derived directly from $B(c, a)$:

$$C(c, a) = \frac{B(c, a)}{1.0 - \rho_{\text{eff}} \cdot (1.0 - B(c, a))}$$

This iterative formulation is free from floating-point overflow and remains strictly bounded in $[0.0, 1.0]$ for any scale $c \ge 1$.

### 4.3 Waiting Time and Backlog Drain

The expected waiting time in queue $W_q$ (in seconds) combines the stationary queue wait with the backlog drain time:

$$W_q = \frac{C(c, a)}{c \mu (1.0 - \rho_{\text{eff}})} + \frac{Q(t)}{c \mu}$$

---

## 5. End-to-End Latency & Tail Percentiles

Total response time $W$ is computed in reverse topological order (callees before callers):

$$W = W_q + \frac{1}{\mu} + W_{\text{base}} + W_{\text{pool\_wait}} + \sum_{e \in \text{SyncDownstream}} W_e \cdot p_e$$

### 5.1 Percentiles and Jitter

- **p50 (Median):** $p50 = W_{\text{ms}}$.
- **p99 (Tail):** Approximated using exponential tail scaling with multiplicative log-normal jitter:

$$p99 = \max\left(p50, 2.5 \cdot p50 \cdot e^{Z}\right), \qquad Z \sim \mathcal{N}(0, \sigma^2), \quad \sigma = 0.025$$

---

## 6. Saturation Cliff & Error Rates

Errors emerge from capacity exhaustion and caller timeout violations:

$$\varepsilon(\rho, W) = \varepsilon_{\text{base}} + \frac{0.5}{1 + e^{-\kappa (\rho - \rho_{\text{crit}})}} + 0.5 \cdot \min\left(1.0, \max\left(0.0, \frac{W - T_{\text{timeout}}}{T_{\text{timeout}}}\right)\right)$$

Where:
- $\varepsilon_{\text{base}} = 0.001$ (0.1% baseline error rate).
- $\rho_{\text{crit}} = 0.90$ (steep saturation inflection threshold).
- $\kappa = 25.0$ (logistic steepness parameter).
- $T_{\text{timeout}}$ is the service timeout threshold.

---

## 7. Little's Law & Connection State Dynamics

By Little's Law, the mean number of concurrent in-flight requests on an edge is:

$$L = \lambda \cdot W \quad (\text{with } W \text{ in seconds})$$

Total socket connections are mapped to kernel TCP states:
- **ESTABLISHED:** $\min(L, \text{pool\_size})$ for pooled resources; $L$ for unpooled connections.
- **TIME_WAIT:** Connection termination churn proportional to request turnover: $\text{round}(0.15 \cdot \lambda)$.
- **CLOSE_WAIT:** Accumulates rapidly when downstream datastores experience pool exhaustion.

---

## 8. Failure Scenarios (Chaos Injection)

| Scenario ID | Name | Duration | Chaos Mechanism | Observable Symptoms |
|---|---|---|---|---|
| `request-storm` | Flash Crowd Storm | 60 s | Hawkes burst $\alpha = 5.0$ | Ingress surges ~6x; queue waits explode; payments and orders degrade |
| `db-pool-exhaustion` | DB Pool Exhaustion | 45 s | Primary PostgreSQL $\mu \to 0.40 \cdot \mu$ | DB saturation cliff; `CLOSE_WAIT` spikes; orders cascade into errors |
| `cache-stampede` | Redis Cache Stampede | 45 s | Cache miss probability rises $0.05 \to 0.80$ | Replica query traffic surges 16x; replica utilization approaches 100% |
| `slow-dependency` | Slow Dependency | 60 s | Payment provider latency $80\text{ ms} \to 1800\text{ ms}$ | Caller timeouts breached; retry storm amplifies payments load |
