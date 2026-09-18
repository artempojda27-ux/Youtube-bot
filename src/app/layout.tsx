import './globals.css';

export const metadata = {
  title: 'YT Trend Scout',
  description: 'Внутренний инструмент анализа трендов американского YouTube и генерации сценариев'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
