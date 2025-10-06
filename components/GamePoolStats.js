// components/GamePoolStats.js
import { useState, useEffect } from 'react';
import { useGamePoolData } from '../hooks/useGamePoolData';
import styles from './GamePoolStats.module.css';

// Helper function to format large numbers
const formatLargeNumber = (value) => {
  const num = BigInt(value);
  const decimals = 18n; // MLEO has 18 decimals
  
  // Convert to human readable format
  const divisor = 10n ** decimals;
  const wholePart = num / divisor;
  const remainder = num % divisor;
  
  // Format with appropriate units
  if (wholePart >= 1000000000n) {
    return `${(Number(wholePart) / 1000000000).toFixed(1)}B`;
  } else if (wholePart >= 1000000n) {
    return `${(Number(wholePart) / 1000000).toFixed(1)}M`;
  } else if (wholePart >= 1000n) {
    return `${(Number(wholePart) / 1000).toFixed(1)}K`;
  } else {
    return wholePart.toString();
  }
};

export default function GamePoolStats() {
  const { data, loading, error } = useGamePoolData();
  const [isLiveData, setIsLiveData] = useState(true);

  // Check if we're using fallback data
  useEffect(() => {
    if (error && data) {
      setIsLiveData(false);
    } else {
      setIsLiveData(true);
    }
  }, [error, data]);

  if (loading) {
    return (
      <div className={styles.gamePoolStats}>
        <div className={styles.loading}>Loading data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.gamePoolStats}>
        <div className={styles.error}>Error loading data: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.gamePoolStats}>
        <div className={styles.error}>No data available</div>
      </div>
    );
  }

  return (
    <div className={styles.gamePoolStats}>
      <h2>🪙 Global MLEO Pool Status</h2>
      
      {/* Data source indicator */}
      <div className={styles.dataSource}>
        <span className={`${styles.indicator} ${isLiveData ? styles.live : styles.fallback}`}>
          {isLiveData ? '🟢 Live Contract Data' : '🟡 Fallback Data'}
        </span>
        {error && (
          <span className={styles.errorMsg}>
            Contract error: {error}
          </span>
        )}
      </div>
      
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <h3>Total Pool</h3>
          <p className={styles.bigNumber}>{formatLargeNumber(data.globalCap)} MLEO</p>
          <p className={styles.smallText}>200B total allocation</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>Total Claimed</h3>
          <p className={styles.bigNumber}>{formatLargeNumber(data.globalClaimed)} MLEO</p>
          <p className={styles.smallText}>By all players</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>Remaining</h3>
          <p className={styles.bigNumber}>{formatLargeNumber(data.remaining)} MLEO</p>
          <p className={styles.smallText}>Available to claim</p>
        </div>
      </div>
      
      {/* בר התקדמות */}
      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${data.percentageClaimed}%` }}
          ></div>
        </div>
        <p className={styles.progressText}>Claimed: {data.percentageClaimed}%</p>
      </div>
      
      <div className={styles.additionalInfo}>
        <p className={`${styles.status} ${data.paused ? styles.paused : styles.active}`}>
          Status: {data.paused ? 'Paused' : 'Active'}
        </p>
        <p className={styles.dailyCap}>
          Daily Cap: {formatLargeNumber(data.dailyUserCap)} MLEO per user
        </p>
      </div>
    </div>
  );
}