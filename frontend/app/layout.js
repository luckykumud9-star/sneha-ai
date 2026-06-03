export const metadata = {
  title: "Sneha AI",
  description: "Your AI Mentor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
