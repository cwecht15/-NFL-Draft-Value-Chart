"""
NFL Draft Value Scaling

Two things we need for the draft-day web app:
  1. Pick Number -> Slot Value (FitzSpielberger chart, already exists)
  2. Big Board Score -> Player Value (rescale scores to the Fitz value range)

This is NOT a prediction model. It's just figuring out the right way to
put Big Board scores onto the same scale as Fitz pick values, so that
similar scores = similar values (no rank-cliff effects).
"""

import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import gspread
from google.oauth2.service_account import Credentials

# ── 1. Pull data from Google Sheets ──────────────────────────────────────────

SERVICE_ACCOUNT = r"C:\Users\cwech\Documents\Football\Keys\fp-data-357113-a6174bb87054.json"
SHEET_URL = "https://docs.google.com/spreadsheets/d/1RM4r3bdiLX4mvthJfeYqiEIc_2fnmm5IlZefIyf6GP4"

creds = Credentials.from_service_account_file(
    SERVICE_ACCOUNT,
    scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
)
gc = gspread.authorize(creds)
sh = gc.open_by_url(SHEET_URL)

# FitzSpielberger: pick -> value lookup
fitz_ws = sh.worksheet("FitzSpielberger")
fitz_raw = fitz_ws.get_all_values()
fitz = {}
for row in fitz_raw[1:]:
    try:
        pick = int(row[0])
        value = float(row[1])
        if value > 0:
            fitz[pick] = value
    except (ValueError, IndexError):
        continue
print(f"Fitz chart: {len(fitz)} picks (1-{max(fitz.keys())})")
print(f"  Pick 1={fitz[1]:.0f}, Pick 32={fitz[32]:.0f}, Pick 100={fitz[100]:.0f}, Pick 256={fitz[256]:.0f}\n")

# Big Board: players with scores
bb_ws = sh.sheet1
bb_raw = bb_ws.get_all_values()
players = []
for row in bb_raw[1:]:
    try:
        if not row[0].strip():
            continue
        players.append({
            "player": row[0],
            "school": row[1],
            "position": row[2],
            "score": float(row[3]),
            "overall": int(row[6]),
        })
    except (ValueError, IndexError):
        continue
bb = pd.DataFrame(players).sort_values("overall").reset_index(drop=True)
print(f"Big Board: {len(bb)} players")
print(f"  Scores: {bb.score.min():.1f} to {bb.score.max():.1f}\n")

# Add rank-based values for comparison
bb["rank_value"] = bb["overall"].map(fitz)

# ── 2. Scaling approaches ────────────────────────────────────────────────────
#
# We want: score -> value, where:
#   - Max score (94.4) = 3000 (same as pick 1)
#   - Score differences map proportionally to value differences
#   - The scale range should match the Fitz range for the number of players
#
# The board has 176 players, so the value floor should be roughly Fitz[176].

MAX_SCORE = bb.score.max()  # 94.4
MIN_SCORE = bb.score.min()  # 70.1
MAX_VALUE = 3000.0
# Floor: Fitz value at the last board rank
N_PLAYERS = len(bb)
MIN_VALUE = fitz.get(N_PLAYERS, fitz[max(fitz.keys())])
print(f"Value range: {MIN_VALUE:.0f} (Fitz[{N_PLAYERS}]) to {MAX_VALUE:.0f} (Fitz[1])")
print(f"Score range: {MIN_SCORE:.1f} to {MAX_SCORE:.1f}\n")

SCORE_RANGE = MAX_SCORE - MIN_SCORE
VALUE_RANGE = MAX_VALUE - MIN_VALUE


def linear_scale(score):
    """Constant rate: every 1 point of score = same value change."""
    return ((score - MIN_SCORE) / SCORE_RANGE) * VALUE_RANGE + MIN_VALUE


def power_scale(score, p):
    """Steeper at top: a 1-point gap at 94 is worth more than at 70."""
    pct = (score - MIN_SCORE) / SCORE_RANGE
    return np.power(pct, p) * VALUE_RANGE + MIN_VALUE


def exp_scale(score, k):
    """Exponential: steepest at top, flattest at bottom."""
    return (np.exp(k * (score - MIN_SCORE)) - 1) / (np.exp(k * SCORE_RANGE) - 1) * VALUE_RANGE + MIN_VALUE


# ── 3. Compare approaches ────────────────────────────────────────────────────

print("=" * 90)
print("SCALING COMPARISON")
print("=" * 90)

approaches = {
    "Linear": {"func": linear_scale, "args": [],
               "js": f"((score - {MIN_SCORE}) / {SCORE_RANGE:.1f}) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Power (p=1.5)": {"func": lambda s: power_scale(s, 1.5), "args": [],
                       "js": f"Math.pow((score - {MIN_SCORE}) / {SCORE_RANGE:.1f}, 1.5) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Power (p=2.0)": {"func": lambda s: power_scale(s, 2.0), "args": [],
                       "js": f"Math.pow((score - {MIN_SCORE}) / {SCORE_RANGE:.1f}, 2.0) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Power (p=2.5)": {"func": lambda s: power_scale(s, 2.5), "args": [],
                       "js": f"Math.pow((score - {MIN_SCORE}) / {SCORE_RANGE:.1f}, 2.5) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Power (p=3.0)": {"func": lambda s: power_scale(s, 3.0), "args": [],
                       "js": f"Math.pow((score - {MIN_SCORE}) / {SCORE_RANGE:.1f}, 3.0) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Exp (k=0.05)":  {"func": lambda s: exp_scale(s, 0.05), "args": [],
                       "js": f"(Math.exp(0.05 * (score - {MIN_SCORE})) - 1) / (Math.exp(0.05 * {SCORE_RANGE:.1f}) - 1) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
    "Exp (k=0.10)":  {"func": lambda s: exp_scale(s, 0.10), "args": [],
                       "js": f"(Math.exp(0.10 * (score - {MIN_SCORE})) - 1) / (Math.exp(0.10 * {SCORE_RANGE:.1f}) - 1) * {VALUE_RANGE:.0f} + {MIN_VALUE:.0f}"},
}

# Header
test_scores = [94.4, 93.4, 93.2, 92.1, 91.0, 90.0, 88.0, 85.0, 80.0, 75.0, 70.1]
print(f"\n{'Approach':20s}", end="")
for s in test_scores:
    print(f" {s:>7.1f}", end="")
print()
print("-" * 105)

# Rank-based for reference
print(f"{'Rank-based':20s}", end="")
for s in test_scores:
    match = bb[bb["score"] >= s - 0.05]
    if len(match) and pd.notna(match.iloc[0]["rank_value"]):
        print(f" {match.iloc[0]['rank_value']:7.0f}", end="")
    else:
        print(f" {'N/A':>7s}", end="")
print("  <-- current (bad)")

# Each scaling approach
for aname, aspec in approaches.items():
    print(f"{aname:20s}", end="")
    for s in test_scores:
        v = aspec["func"](s)
        print(f" {v:7.0f}", end="")
    print()

# ── 4. Per-point rate analysis ────────────────────────────────────────────────

print(f"\nPer-point value rates at different score levels:")
print(f"{'Approach':20s}  {'94->93':>8s}  {'93->92':>8s}  {'85->84':>8s}  {'75->74':>8s}  {'Top/Bot':>8s}")
print("-" * 75)

for aname, aspec in approaches.items():
    r_94_93 = aspec["func"](94) - aspec["func"](93)
    r_93_92 = aspec["func"](93) - aspec["func"](92)
    r_85_84 = aspec["func"](85) - aspec["func"](84)
    r_75_74 = aspec["func"](75) - aspec["func"](74)
    ratio = r_94_93 / r_75_74 if r_75_74 > 0 else 999
    print(f"{aname:20s}  {r_94_93:8.1f}  {r_93_92:8.1f}  {r_85_84:8.1f}  {r_75_74:8.1f}  {ratio:7.1f}x")

print(f"\n  Linear: every point is worth the same everywhere")
print(f"  Power/Exp: top-end points are worth MORE (realistic for elite talent)")
print(f"  Question: how much more should a point at the top be worth?\n")

# ── 5. Draft-day test with top 15 players ─────────────────────────────────────

print("=" * 90)
print("DRAFT-DAY TEST: Top 15 Big Board players")
print("=" * 90)

# Using each approach, show what happens if players go at their board rank
for aname in ["Rank-based", "Linear", "Power (p=2.0)", "Exp (k=0.10)"]:
    print(f"\n--- {aname} ---")
    print(f"{'#':>3s}  {'Player':22s}  {'Score':>6s}  {'SlotVal':>8s}  {'PlyrVal':>8s}  {'Diff':>8s}")
    print("-" * 65)
    for _, row in bb.head(15).iterrows():
        slot_v = fitz.get(row["overall"], 0)
        if aname == "Rank-based":
            player_v = row["rank_value"]
        elif aname == "Linear":
            player_v = linear_scale(row["score"])
        elif aname == "Power (p=2.0)":
            player_v = power_scale(row["score"], 2.0)
        else:
            player_v = exp_scale(row["score"], 0.10)
        diff = player_v - slot_v
        print(f"{row['overall']:3d}  {row['player']:22s}  {row['score']:6.1f}  {slot_v:8.0f}  {player_v:8.0f}  {diff:+8.0f}")


# ── 6. Visualization ─────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(16, 12))
fig.suptitle("NFL Draft Value Scaling: Score -> Value", fontsize=18, fontweight="bold")

plot_scores = np.linspace(MIN_SCORE, MAX_SCORE, 300)
colors = {"Linear": "blue", "Power (p=1.5)": "green", "Power (p=2.0)": "orange",
          "Power (p=2.5)": "red", "Power (p=3.0)": "darkred",
          "Exp (k=0.05)": "purple", "Exp (k=0.10)": "magenta"}

# 6a: All approaches
ax = axes[0, 0]
ax.scatter(bb["score"], bb["rank_value"], s=15, alpha=0.4, color="gray", label="Rank-based (current)")
for aname, aspec in approaches.items():
    vals = [aspec["func"](s) for s in plot_scores]
    ax.plot(plot_scores, vals, linewidth=2, alpha=0.8, color=colors[aname], label=aname)
ax.set_xlabel("Big Board Score")
ax.set_ylabel("Value")
ax.set_title("All Scaling Approaches vs Rank-Based")
ax.legend(fontsize=7)
ax.grid(alpha=0.3)

# 6b: Top scores zoom (88+)
ax = axes[0, 1]
top_mask = bb["score"] >= 88
ax.scatter(bb.loc[top_mask, "score"], bb.loc[top_mask, "rank_value"],
           s=25, alpha=0.5, color="gray", label="Rank-based", zorder=1)
zoom_scores = np.linspace(88, MAX_SCORE, 200)
for aname in ["Linear", "Power (p=2.0)", "Power (p=2.5)", "Exp (k=0.10)"]:
    aspec = approaches[aname]
    vals = [aspec["func"](s) for s in zoom_scores]
    ax.plot(zoom_scores, vals, linewidth=2.5, alpha=0.8, color=colors[aname], label=aname)
# Annotate top 5
for _, p in bb.head(5).iterrows():
    ax.axvline(x=p["score"], color="lightblue", alpha=0.5, linewidth=1)
    ax.text(p["score"], 300, f"#{p['overall']}\n{p['player'].split()[-1]}\n{p['score']:.1f}",
            fontsize=7, ha="center", va="bottom", color="blue")
ax.set_xlabel("Big Board Score")
ax.set_ylabel("Value")
ax.set_title("Top Scores Zoom (88+)")
ax.legend(fontsize=8)
ax.grid(alpha=0.3)

# 6c: Per-point rate across score range
ax = axes[1, 0]
rate_scores = np.linspace(MIN_SCORE + 0.5, MAX_SCORE - 0.5, 200)
for aname in ["Linear", "Power (p=1.5)", "Power (p=2.0)", "Power (p=2.5)", "Exp (k=0.10)"]:
    aspec = approaches[aname]
    rates = [aspec["func"](s + 0.5) - aspec["func"](s - 0.5) for s in rate_scores]
    ax.plot(rate_scores, rates, linewidth=2, alpha=0.8, color=colors[aname], label=aname)
ax.set_xlabel("Big Board Score")
ax.set_ylabel("Value per 1.0 Score Point")
ax.set_title("How Much Is Each Score Point Worth?")
ax.legend(fontsize=8)
ax.grid(alpha=0.3)

# 6d: Pick Score (player value - slot value) for top 32
ax = axes[1, 1]
top32 = bb.head(32).copy()
for aname, color in [("Rank-based", "gray"), ("Linear", "blue"),
                      ("Power (p=2.0)", "orange"), ("Exp (k=0.10)", "magenta")]:
    if aname == "Rank-based":
        top32["pv"] = top32["rank_value"]
    else:
        top32["pv"] = top32["score"].apply(approaches[aname]["func"])
    top32["pick_score"] = top32["pv"] - top32["overall"].map(fitz)
    ax.bar(top32["overall"] + (list(["Rank-based", "Linear", "Power (p=2.0)", "Exp (k=0.10)"]).index(aname) - 1.5) * 0.2,
           top32["pick_score"], width=0.2, alpha=0.7, color=color, label=aname)
ax.axhline(y=0, color="black", linewidth=0.5)
ax.set_xlabel("Overall Rank / Pick")
ax.set_ylabel("Pick Score (Player Value - Slot Value)")
ax.set_title("Pick Score Comparison: Top 32 Players at Their Rank")
ax.legend(fontsize=8)
ax.grid(alpha=0.3)

plt.tight_layout()
output_dir = r"C:\Users\cwech\Documents\Claude\Projects\NFL_Draft_Value_Chart\output"
plt.savefig(f"{output_dir}/curve_comparison.png", dpi=200)
print(f"\nPlot saved to {output_dir}/curve_comparison.png")


# ── 7. Save results ──────────────────────────────────────────────────────────

output = {
    "fitz_lookup": fitz,
    "score_scaling": {
        "max_score": MAX_SCORE,
        "min_score": MIN_SCORE,
        "max_value": MAX_VALUE,
        "min_value": MIN_VALUE,
        "approaches": {},
    },
    "big_board": [
        {"player": r["player"], "school": r["school"], "position": r["position"],
         "score": r["score"], "overall": r["overall"]}
        for _, r in bb.iterrows()
    ],
}

for aname, aspec in approaches.items():
    output["score_scaling"]["approaches"][aname] = {
        "js_formula": aspec["js"],
    }

with open(f"{output_dir}/best_fit.json", "w") as f:
    json.dump(output, f, indent=2)
print(f"Results saved to {output_dir}/best_fit.json")
