import './globals.css';

export const metadata = {
  title: 'Lead Generation CRM',
  description: 'Manage and track business leads',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
