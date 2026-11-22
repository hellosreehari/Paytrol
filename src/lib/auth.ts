import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

const providers: NextAuthOptions['providers'] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

// Credentials provider for instant local testing / demo mode
providers.push(
  CredentialsProvider({
    id: 'demo',
    name: 'Demo Account',
    credentials: {
      email: { label: 'Email', type: 'email', placeholder: 'driver@paytrol.app' },
      name: { label: 'Name', type: 'text', placeholder: 'Sreehari' },
    },
    async authorize(credentials) {
      const email = credentials?.email || 'driver@paytrol.app';
      const name = credentials?.name || 'Sreehari';
      return {
        id: 'demo-user',
        name,
        email,
        image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      };
    },
  })
);

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.uid = user.id;
      }
      if (account && profile) {
        token.uid = account.providerAccountId || user.id;
        token.picture =
          ('picture' in profile && typeof profile.picture === 'string'
            ? profile.picture
            : user.image) || undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.uid = token.uid || token.sub || 'demo-user';
        if (token.picture) {
          session.user.image = token.picture as string;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/',
  },
  secret: process.env.NEXTAUTH_SECRET || 'paytrol-development-secret-key-1234567890',
};
