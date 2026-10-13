// The server keeps absolute seats and node IDs; only the display uses the
// viewer's seat. Tiles follow their current board region, never their owner.
export function boardViewAngle(viewerSeat) {
  return (360 - 90 * viewerSeat) % 360
}

export function nodeViewAngle(regionSeat, viewerSeat) {
  if (regionSeat < 0) return 0 // Shared railway: horizontal for every viewer.
  const relativeSeat = (regionSeat - viewerSeat + 4) % 4
  return relativeSeat === 1 ? 90 : relativeSeat === 3 ? -90 : 0
}

export function nodeLocalAngle(regionSeat, viewerSeat) {
  const angle = nodeViewAngle(regionSeat, viewerSeat) - boardViewAngle(viewerSeat)
  return ((angle + 180) % 360 + 360) % 360 - 180
}
