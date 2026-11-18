import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Radar Jurídico & API de Publicações (CNJ / PJe / eproc)',
  description:
    'Plataforma e API de Inteligência Jurídica: Busca por OAB, Radar de Clientes (ex: LG), Monitoramento de Concorrência e Auto-Atualização de Processos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
