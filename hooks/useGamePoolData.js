// hooks/useGamePoolData.js
import { useState, useEffect } from 'react';

const CLIENT_FALLBACK = {
  globalCap: '200000000000000000000000000000',
  globalClaimed: '1250000000000000000000000000',
  dailyUserCap: '50000000000000000000000000',
  remaining: '198750000000000000000000000000',
  percentageClaimed: '0.63',
  paused: false,
  _source: 'client_fallback',
};

export const useGamePoolData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        const response = await fetch('/api/game-pool-data');

        let result = null;
        if (response.ok) {
          try {
            result = await response.json();
          } catch (parseErr) {
            console.warn('game-pool-data: invalid JSON body', parseErr);
          }
        } else {
          console.warn(`game-pool-data: HTTP ${response.status}`);
        }

        if (
          !response.ok ||
          !result ||
          typeof result !== 'object' ||
          result.error
        ) {
          if (result?.error) {
            console.warn('game-pool-data:', result.error);
          }
          setData(CLIENT_FALLBACK);
          setError(null);
        } else {
          setData(result);
          setError(null);
        }
      } catch (err) {
        console.warn('Error fetching game pool data:', err);
        setData(CLIENT_FALLBACK);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);

    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
};
