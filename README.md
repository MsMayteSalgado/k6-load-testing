If you mean **real geographic regions you can simulate**, GitHub-hosted runners are limited.

You do **not get true global regions** out of the box.

---

# What GitHub actually provides

GitHub runners run in a few fixed Azure regions.

You cannot select region directly.

Typical locations:

| Label          | Real location      |
| -------------- | ------------------ |
| ubuntu-latest  | US (often East US) |
| windows-latest | US                 |
| macos-latest   | US                 |

Sometimes:

- Europe or Asia fallback
- but not guaranteed
- not selectable

---

# So your current `regions` input

```text
region-1,region-2
```

is only:

- logical labeling
- not real geo distribution

---

# If you want real regions

You need one of these setups.

---

## Option 1. Self-hosted runners per region

You deploy runners in different locations.

Example regions:

| Region label | Location                |
| ------------ | ----------------------- |
| us-east      | AWS us-east-1           |
| eu-west      | AWS eu-west-1           |
| ap-south     | AWS ap-south-1 (Mumbai) |
| ap-southeast | AWS Singapore           |
| eu-central   | Frankfurt               |

Then map in workflow:

```yaml
runs-on: [self-hosted, us-east]
```

---

## Option 2. Cloud VM runners

Spin VMs manually:

- AWS
- GCP
- Azure

Install:

- k6
- GitHub runner

---

## Option 3. k6 cloud (easiest)

Using Grafana k6 cloud:

Available regions:

- us-east-1
- us-west-2
- eu-west-1
- ap-southeast-1
- ap-northeast-1

---

# Recommended region set for your setup

If you want realistic naming:

```text
us-east,eu-west,ap-south,ap-southeast
```

Example input:

```text
regions: us-east,eu-west,ap-south
instances: 1,2
```

---

# Important reality check

Right now your system:

- simulates regions via headers
- does not change network latency
- does not change IP geography

So results show:

- app behavior
- not global latency differences

---

# If your goal is

## Backend load testing

Your setup is fine.

## Real user latency testing

You need:

- real geo runners
- or k6 cloud

---

# Clean recommendation

Use this naming:

```text
regions: us-east,eu-west,ap-south
```

Then later you can plug real infra without changing code.

---

If you want, I can help you:

- convert this into true geo-distributed runners
- or wire k6 cloud with same script

That is the step from "simulation" to "real performance testing".
