"""Command-line interface for running the Prahari Simulator."""

import argparse
import asyncio
import json
import sys

from services.simulator.runner import SimulationRunner


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prahari Agent Governance Simulator (Seeded & Deterministic)"
    )
    parser.add_argument(
        "--scenario",
        choices=["benign", "injection", "bulk_export", "pii", "loop", "privilege", "all"],
        default="all",
        help="Simulation scenario to execute (default: all)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic generation (default: 42)",
    )
    parser.add_argument(
        "--rate",
        type=float,
        default=2.0,
        help="Calls per second dispatch rate (default: 2.0)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Total number of tool calls to execute (default: 20)",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:8000",
        help="Base URL of Prahari API Gateway (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--admin-token",
        default="prahari-admin-dev-secret",
        help="Admin token for provisioning (default: prahari-admin-dev-secret)",
    )
    parser.add_argument(
        "--stress",
        action="store_true",
        help="Stress mode: provisions 200 nodes (50 agents + 150 tools)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON string",
    )
    return parser.parse_args()


async def main_async() -> int:
    args = parse_args()

    runner = SimulationRunner(
        api_url=args.api_url,
        admin_token=args.admin_token,
        seed=args.seed,
        rate=args.rate,
    )

    if not args.json:
        print("=" * 65)
        print("Prahari Synthetic Agent Governance Simulator")
        print("=" * 65)
        print(f"Scenario    : {args.scenario}")
        print(f"Seed        : {args.seed} (Deterministic)")
        print(f"Count       : {args.count}")
        print(f"Target URL  : {args.api_url}")
        print(f"Stress Mode : {'ENABLED (200 nodes)' if args.stress else 'DISABLED'}")
        print("-" * 65)
        print("Provisioning agents & tools...")

    try:
        results = await runner.run(
            scenario=args.scenario,
            count=args.count,
            stress=args.stress,
        )
    except Exception as e:
        print(f"Simulation failed to connect or execute: {e}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps(results, indent=2))
        return 0

    print("-" * 65)
    print(f"{'#':<4} {'Agent':<15} {'Tool':<20} {'Decision':<10} {'Rule / Reason'}")
    print("-" * 65)

    stats: dict[str, int] = {}
    for idx, r in enumerate(results, 1):
        dec = r.get("decision", "unknown")
        stats[dec] = stats.get(dec, 0) + 1
        rule = r.get("rule_id") or r.get("reason") or ""
        print(f"{idx:<4} {r['agent']:<15} {r['tool']:<20} {dec:<10} {rule}")

    print("=" * 65)
    print(f"Total Dispatched: {len(results)}")
    print("Outcome Breakdown:")
    for outcome, cnt in sorted(stats.items()):
        print(f"  {outcome.upper():<10}: {cnt} calls ({cnt / len(results) * 100:.1f}%)")
    print("=" * 65)
    return 0


def main() -> None:
    sys.exit(asyncio.run(main_async()))


if __name__ == "__main__":
    main()
