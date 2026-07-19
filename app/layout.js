import './globals.css';
import RegisterSW from './register-sw';

export const metadata = {
  title: 'Lead Generation CRM',
  description: 'Manage and track business leads',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lead CRM',
  },
};

export const viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
