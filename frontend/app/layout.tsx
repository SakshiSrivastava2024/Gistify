import "./globals.css";

export const metadata = {
  title: "Gistify",
  description: "Never leave the paper to understand the paper.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}