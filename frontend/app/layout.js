import "./globals.css";

export const metadata = {
  title: "Sneha AI",
  description: "Personal AI Mentor for Yash",
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <body>{children}</body>
    </html>
  );
}
