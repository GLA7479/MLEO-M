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
        setData(result);
      } catch (error) {
        console.error('Error fetching game pool data:', error);
        setError(error.message);
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