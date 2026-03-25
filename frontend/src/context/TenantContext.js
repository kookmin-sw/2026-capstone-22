import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { tenantAPI } from '../services/api';

const TenantContext = createContext();

export function useTenant() {
  return useContext(TenantContext);
}

export const TenantProvider = ({ children }) => {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();

  // Extract slug from URL pattern /:slug/...
  // We don't use useParams here because TenantProvider wraps the whole app or routes
  // so we parse the pathname directly, expecting the first segment to be the slug
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const currentSlug = pathSegments.length > 0 && pathSegments[0] !== 'superadmin' ? pathSegments[0] : null;

  useEffect(() => {
    let isMounted = true;
    
    const fetchTenant = async () => {
      // If no slug (e.g. root '/' or '/superadmin' or '/login' without slug)
      // Note: for this architecture, root '/' must redirect to a default tenant or show a landing page
      // But typically we expect /readytalk/... 
      if (!currentSlug) {
        if (isMounted) {
          setTenant(null);
          setLoading(false);
          setError(null);
        }
        return;
      }
      
      try {
        if (isMounted) setLoading(true);
        const res = await tenantAPI.getPublicInfo(currentSlug);
        if (isMounted) {
          setTenant(res.data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to fetch tenant info:', err);
          setError('테넌트 정보를 불러오지 못했습니다. URL을 확인해주세요.');
          setTenant(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTenant();

    return () => {
      isMounted = false;
    };
  }, [currentSlug]);

  const value = {
    tenant,
    currentSlug,
    loading,
    error,
  };

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};
