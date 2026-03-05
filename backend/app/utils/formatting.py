"""
utils/formatting.py — Number formatting and solar profile helpers.

Ported verbatim from dashboard.py:
  _fmt_inr()            → format_inr()
  _fmt_kwh()            → format_kwh()
  _solar_profile_24h()  → solar_profile_24h()

The private underscore names are aliased for backwards-compat with any
internal callers, but the public names are preferred in new code.
"""
from __future__ import annotations

import pandas as pd


# ---------------------------------------------------------------------------
# INR / kWh formatters (ported verbatim from dashboard.py)
# ---------------------------------------------------------------------------

def format_inr(x: float) -> str:
    """Format a rupee value with Cr / L / K suffix."""
    x = float(x or 0.0)
    if abs(x) >= 1e7:
        return f"₹{x / 1e7:.2f}Cr"
    if abs(x) >= 1e5:
        return f"₹{x / 1e5:.2f}L"
    if abs(x) >= 1e3:
        return f"₹{x / 1e3:.1f}K"
    return f"₹{x:.0f}"


def format_kwh(x: float) -> str:
    """Format an energy value with GWh / MWh / kWh suffix."""
    x = float(x or 0.0)
    if abs(x) >= 1e6:
        return f"{x / 1e6:.2f} GWh"
    if abs(x) >= 1e3:
        return f"{x / 1e3:.2f} MWh"
    return f"{x:.0f} kWh"


# Legacy aliases (used by service functions that were ported from dashboard.py)
_fmt_inr = format_inr
_fmt_kwh = format_kwh


# ---------------------------------------------------------------------------
# Solar profile helper (ported verbatim from dashboard.py)
# ---------------------------------------------------------------------------

def solar_profile_24h(
    total: float,
    *,
    sunrise_hour: int = 6,
    sunset_hour: int = 18,
) -> pd.Series:
    """
    Distribute *total* kWh across a 24-hour period using a bell-curve
    approximation between sunrise and sunset.

    Returns a pd.Series indexed 0–23 (hours).
    """
    import numpy as np

    hours = pd.Series(range(24), dtype=float)
    profile = pd.Series(0.0, index=range(24))

    solar_hours = [h for h in range(24) if sunrise_hour <= h <= sunset_hour]
    if not solar_hours:
        return profile

    mid = (sunrise_hour + sunset_hour) / 2.0
    sigma = (sunset_hour - sunrise_hour) / 4.0

    weights = pd.Series(
        {h: float(np.exp(-0.5 * ((h - mid) / sigma) ** 2)) for h in solar_hours}
    )
    total_weight = weights.sum()
    if total_weight > 0:
        for h in solar_hours:
            profile[h] = total * weights[h] / total_weight

    return profile


# Legacy alias
_solar_profile_24h = solar_profile_24h
