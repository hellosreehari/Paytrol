import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      uid: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    uid?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    picture?: string;
  }
}
