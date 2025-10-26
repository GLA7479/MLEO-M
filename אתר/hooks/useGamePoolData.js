// hooks/useGamePoolData.js
import { useState, useEffect } from 'react';

export const useGamePoolData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const response = await fetch('/api/game-pool-data');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Check if we got an error response
        if (result.error) {
          throw new Error(result.error);
        }
        
        setData(result);
      } catch (error) {
        console.error('Error fetching game pool data:', error);
        setError(error.message);
        
        // Set fallback data if contract fails
        setData({
          globalCap: "200000000000000000000000000000", // 200B MLEO (with 18 decimals)
          globalClaimed: "1250000000000000000000000000", // 1.25B MLEO claimed
          dailyUserCap: "50000000000000000000000000", // 50M MLEO daily cap per user
          remaining: "198750000000000000000000000000", // Remaining in pool
          percentageClaimed: "0.63", // 0.63% claimed
          paused: false
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000); // רענון כל 30 שניות
    
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
};