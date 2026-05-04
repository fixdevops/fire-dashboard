"use client"

import { motion } from "framer-motion"

export default function FireAlert({ fire = true }: { fire?: boolean }) {
  return (
    <div className="relative rounded-2xl p-5 text-white bg-red-500 shadow-lg overflow-hidden">

      {/* 🔥 SVG FLAME */}
      {fire && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.svg
            width="90"
            height="90"
            viewBox="0 0 100 100"
            initial={{ scale: 0.9, opacity: 0.8 }}
            animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <defs>
              <radialGradient id="flameGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff176" />
                <stop offset="50%" stopColor="#ff9800" />
                <stop offset="100%" stopColor="#f44336" />
              </radialGradient>
            </defs>

            {/* Outer flame */}
            <motion.path
              d="M50 10 C65 30, 85 40, 75 65 C70 80, 55 90, 50 90 C45 90, 30 80, 25 65 C15 40, 35 30, 50 10 Z"
              fill="url(#flameGrad)"
              animate={{ d: [
                "M50 10 C65 30, 85 40, 75 65 C70 80, 55 90, 50 90 C45 90, 30 80, 25 65 C15 40, 35 30, 50 10 Z",
                "M50 12 C68 28, 88 42, 76 66 C70 82, 56 92, 50 92 C44 92, 30 82, 24 66 C12 42, 32 28, 50 12 Z",
                "M50 10 C65 30, 85 40, 75 65 C70 80, 55 90, 50 90 C45 90, 30 80, 25 65 C15 40, 35 30, 50 10 Z"
              ]}}
              transition={{ duration: 1.2, repeat: Infinity }}
            />

            {/* Inner flame */}
            <motion.path
              d="M50 35 C58 45, 65 55, 60 70 C58 78, 52 85, 50 85 C48 85, 42 78, 40 70 C35 55, 42 45, 50 35 Z"
              fill="#fff176"
              animate={{ scale: [1, 1.1, 1], opacity: [0.9, 1, 0.9] }}
              transition={{ duration: 1, repeat: Infinity }}
              transform="translate(0,0)"
            />
          </motion.svg>
        </div>
      )}

      <p className="text-sm opacity-80 mb-2 relative z-10">
        Fire Alert Panel
      </p>

      <p className="font-semibold relative z-10">
        🔥 FLAME DETECTED (Pin 34: LOW)
      </p>
    </div>
  )
}