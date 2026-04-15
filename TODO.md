# NFL Draft Value Chart - TODO

## Next: Trade Compensation Overhaul

The current trade modal uses a text input for pick numbers. Replace with:

### 1. Dropdown of available picks per team
- When a team is selected as trading up, show a checklist of all their remaining picks (drafted picks excluded)
- Pull from `DRAFT_ORDER` and filter out picks already made
- Show pick number, round, and Fitz value for each

### 2. Future picks (2027/2028)
- Add future pick options: each team has 7 rounds of picks in 2027 and 2028
- Future picks don't have exact pick numbers yet, so value them by round average:
  - Use the FitzSpielberger value at the midpoint of each round
  - e.g. 2027 R1 = Fitz value at pick 16 (mid-first-round), R2 = Fitz at pick 48, etc.
- Apply a discount factor for future years (the 0.75 multiplier from the FitzSpielberger sheet column H)
  - 2027 picks = 75% of current-year value
  - 2028 picks = 75% * 75% = ~56% of current-year value
- UI: show as "2027 1st (est. ~1595)", "2027 2nd (est. ~810)", etc.

### 3. Track team pick inventory
- Maintain a live inventory of what picks each team owns (current + future)
- Trades update both teams' inventories
- Show pick inventory on hover or in a team detail panel
