import './globals.css';

export const metadata = {
  title: 'NutriPantry',
  description: 'Goal-based recipe recommendation from the ingredients you already have.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <h1>NutriPantry</h1>
            <nav>
              <a href="/">Dashboard</a>
              <a href="/pantry">Pantry</a>
              <a href="/recommend">Recommend</a>
              <a href="/admin">Admin</a>
              <a href="/login">Login</a>
            </nav>
          </header>
          {children}
          <footer>
            DBMS Level 3 Mini Project · PostgreSQL + pgvector · Next.js
          </footer>
        </div>
      </body>
    </html>
  );
}
