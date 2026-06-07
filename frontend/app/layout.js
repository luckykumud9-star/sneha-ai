import "./globals.css";

export const metadata = {
  title: "Sneha YS",
  description:
    "Sneha YS - AI Mentor, Study OS, Creator Studio, Mission Control",
  keywords: [
    "Sneha YS",
    "AI Mentor",
    "Study OS",
    "Creator Studio",
    "Programming Academy",
    "Mission Control"
  ]
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
