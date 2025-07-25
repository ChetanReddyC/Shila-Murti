import React, { useState } from 'react';
import styles from './CosmicVariationSwitcher.module.css';

interface CosmicVariationSwitcherProps {
  onVariationChange: (variation: number) => void;
  currentVariation: number;
}

const variations = [
  { id: 1, name: "Galactic Nebula", description: "Deep space nebula with spiral arms" },
  { id: 2, name: "Aurora Cosmic", description: "Flowing aurora-like waves" },
  { id: 3, name: "Solar Flare", description: "Intense solar energy streams" },
  { id: 4, name: "Quantum Field", description: "Electric quantum fluctuations" },
  { id: 5, name: "Cosmic Storm", description: "Turbulent cosmic lightning" }
];

const CosmicVariationSwitcher: React.FC<CosmicVariationSwitcherProps> = ({ 
  onVariationChange, 
  currentVariation 
}) => {
  return (
    <div className={styles.switcher}>
      <h3 className={styles.title}>Cosmic Variations</h3>
      <div className={styles.variationGrid}>
        {variations.map((variation) => (
          <button
            key={variation.id}
            className={`${styles.variationButton} ${
              currentVariation === variation.id ? styles.active : ''
            }`}
            onClick={() => onVariationChange(variation.id)}
          >
            <div className={styles.variationName}>{variation.name}</div>
            <div className={styles.variationDescription}>{variation.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CosmicVariationSwitcher;