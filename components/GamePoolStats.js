// components/GamePoolStats.js
import { useGamePoolData } from '../hooks/useGamePoolData';
import styles from './GamePoolStats.module.css';

export default function GamePoolStats() {
  const { data, loading, error } = useGamePoolData();

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
      
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <h3>Total Pool</h3>
          <p className={styles.bigNumber}>{BigInt(data.globalCap).toLocaleString()} MLEO</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>Total Claimed</h3>
          <p className={styles.bigNumber}>{BigInt(data.globalClaimed).toLocaleString()} MLEO</p>
        </div>
        
        <div className={styles.statCard}>
          <h3>Remaining</h3>
          <p className={styles.bigNumber}>{BigInt(data.remaining).toLocaleString()} MLEO</p>
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
      
      <p className={`${styles.status} ${data.paused ? styles.paused : styles.active}`}>
        Status: {data.paused ? 'Paused' : 'Active'}
      </p>
    </div>
  );
}