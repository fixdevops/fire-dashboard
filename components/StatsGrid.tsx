export default function StatsGrid() {
  const stats = [
    { name: "Flame Sensor", pin: 34, status: "LOW" },
    { name: "Relay", pin: 27, status: "ON" },
    { name: "LED", pin: 2, status: "ON" },
    { name: "Buzzer", pin: 14, status: "OFF" },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s, i) => (
        <div key={i} className="bg-white/70 p-3 rounded-xl shadow">
          <p className="text-sm">{s.name}</p>
          <p className="font-bold">Pin {s.pin}</p>
          <p>{s.status}</p>
        </div>
      ))}
    </div>
  )
}