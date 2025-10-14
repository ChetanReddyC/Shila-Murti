import AccountPage from './accountPage';
import SessionGuard from '@/components/SessionGuard';
 
// Export the AccountPage component as the default export for this route
export default function Page() {
  return (
    <SessionGuard>
      <AccountPage />
    </SessionGuard>
  );
} 