"use client"

import { motion } from "framer-motion"
import { useState, useEffect } from "react"

export default function ServoGauge() {
  const [angle, setAngle] = useState(125)

  // simulasi (nanti ganti realtime)
  useEffect(() => {
    const i = setInterval(() => {
      setAngle(a => (a + 15) % 180)
    }, 2000)
    return () => clearInterval(i)
  }, [])

  const rotation = angle - 90

  return (
    <div className="flex flex-col items-center">

      <svg width="260" height="160" viewBox="0 0 260 160">

        {/* ARC BACKGROUND */}
        <path
          d="M20 140 A110 110 0 0 1 240 140"
          stroke="#d1d5db"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />

        {/* ARC ACTIVE */}
        <path
          d="M20 140 A110 110 0 0 1 240 140"
          stroke="#3b82f6"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray="345"
          strokeDashoffset={345 - (angle / 180) * 345}
        />

        {/* TICKS */}
        {[0, 30, 60, 90, 120, 150, 180].map((t) => {
          const rad = (t - 90) * (Math.PI / 180)
          const x1 = 130 + Math.cos(rad) * 95
          const y1 = 140 + Math.sin(rad) * 95
          const x2 = 130 + Math.cos(rad) * 110
          const y2 = 140 + Math.sin(rad) * 110

          return (
            <line
              key={t}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#9ca3af"
              strokeWidth="2"
            />
          )
        })}

        {/* NEEDLE */}
        <motion.line
          x1="130"
          y1="140"
          x2="130"
          y2="40"
          stroke="#2563eb"
          strokeWidth="4"
          strokeLinecap="round"
          animate={{ rotate: rotation }}
          transition={{ type: "spring", stiffness: 80, damping: 12 }}
          style={{
            originX: "130px",
            originY: "140px"
          }}
        />

        {/* CENTER */}
        <circle cx="130" cy="140" r="6" fill="#2563eb" />
      </svg>

      <p className="text-3xl font-semibold mt-2">{angle}°</p>
    </div>
  )
}