# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board and acks it — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Each incident row opens its incident panel (`data-testid="incident-panel"`, naming the incident id). The panel
  holds the **Ack** button (`data-testid="panel-ack"`). Ack sends the ack (`api.ack(id)`) for the incident the panel
  names and marks that row acked.
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `incident-panel` | the incident panel, naming the incident id (`data-id`) |
| `panel-ack` | the Ack button in the panel |
| `acked` | the acked mark in a row or in the panel |
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.

## Decisions

- **2026-11-16, product**, after the step-one recording: ack leaves the row. A row opens its incident panel, and
  Ack lives there. Reason: an ack fired at a row that moved under the pointer took the wrong incident
  (aimed INC-5215, acked INC-6166). The panel names the incident before anyone acks it.
  Hooks: `incident-panel`, `panel-ack`; `acked` stays.
