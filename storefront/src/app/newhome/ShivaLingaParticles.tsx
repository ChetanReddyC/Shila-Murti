'use client';

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { loadPolygonMaskPlugin } from "@tsparticles/plugin-polygon-mask";

export default function ShivaLingaParticles() {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
      await loadPolygonMaskPlugin(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) return null;

  return (
    <div className="w-full h-full pointer-events-none">
        <Particles
            id="tsparticles"
            url="/Shivalingambottompartconstellation.json"
            className="w-full h-full"
            options={{
                background: {
                    color: {
                        value: "transparent"
                    },
                    opacity: 0
                },
                particles: {
                    color: { value: "#000000" },
                    links: { color: "#000000" }
                },
                polygon: {
                    scale: 0.35,
                    position: {
                        x: 50,
                        y: 55
                    },
                    draw: {
                        stroke: { color: "#000000" }
                    }
                },
                fullScreen: {
                    enable: false,
                    zIndex: 0
                },
                detectRetina: true
            }}
        />
    </div>
  );
}
