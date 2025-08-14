const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const { User } = require('../models');

// Helper: determine if an email should be admin based on env ADMIN_EMAILS (comma-separated)
function isAdminEmail(email) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(String(email).trim().toLowerCase());
}

module.exports = function(passport) {
  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ where: { googleId: profile.id } });
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      const makeAdmin = isAdminEmail(email);
      
      if (user) {
        // Ensure admin flag is up-to-date if email matches
        if (makeAdmin && !user.isAdmin) {
          user.isAdmin = true;
          await user.save();
        }
        return done(null, user);
      }
      
      // Check if user exists with same email
      user = email ? await User.findOne({ where: { email } }) : null;
      
      if (user) {
        user.googleId = profile.id;
        if (makeAdmin && !user.isAdmin) {
          user.isAdmin = true;
        }
        await user.save();
        return done(null, user);
      }
      
      // Create new user
      user = await User.create({
        googleId: profile.id,
        username: profile.displayName.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 1000),
        email,
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        avatar: profile.photos[0].value,
        isAdmin: makeAdmin
      });
      
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

  // GitHub OAuth Strategy
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "/api/auth/github/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ where: { githubId: profile.id } });
      
      if (user) {
        // If we can infer email and it's in admin list, sync flag
        const emailExisting = user.email;
        if (isAdminEmail(emailExisting) && !user.isAdmin) {
          user.isAdmin = true;
          await user.save();
        }
        return done(null, user);
      }
      
      // Check if user exists with same email
      const email = profile.emails ? profile.emails[0].value : `${profile.username}@github.local`;
      const makeAdmin = isAdminEmail(email);
      user = await User.findOne({ where: { email } });
      
      if (user) {
        user.githubId = profile.id;
        if (makeAdmin && !user.isAdmin) {
          user.isAdmin = true;
        }
        await user.save();
        return done(null, user);
      }
      
      // Create new user
      user = await User.create({
        githubId: profile.id,
        username: profile.username,
        email,
        firstName: profile.displayName ? profile.displayName.split(' ')[0] : profile.username,
        lastName: profile.displayName ? profile.displayName.split(' ').slice(1).join(' ') : '',
        avatar: profile.photos[0].value,
        isAdmin: makeAdmin
      });
      
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

  // JWT Strategy
  passport.use(new JwtStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'your-jwt-secret'
  },
  async (payload, done) => {
    try {
      const user = await User.findByPk(payload.id);
      if (user && !user.isBlocked) {
        return done(null, user);
      }
      return done(null, false);
    } catch (error) {
      return done(error, false);
    }
  }));

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};