export function requirePremium(req, res, next) {
  if (req.user?.plan !== 'premium') {
    return res.status(403).json({ error: 'Premium access required' });
  }
  next();
}
