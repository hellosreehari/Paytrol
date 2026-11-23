import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const providers: NextAuthOptions['providers'] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

const nextAuthSecret = process.env.NEXTAUTH_SECRET;
export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (process.env.NODE_ENV === 'production' && !nextAuthSecret) {
        throw new Error('NEXTAUTH_SECRET must be configured in production.');
      }
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
        session.user.uid = token.uid || token.sub || '';
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
  secret: nextAuthSecret,
};
