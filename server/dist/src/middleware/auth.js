export function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        next();
        return;
    }
    res.status(401).json({ error: "Unauthorized" });
}
export function requireRole(role) {
    return (req, res, next) => {
        if (!req.isAuthenticated() || !req.user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        if (req.user.role !== role) {
            res.status(403).json({ error: "Forbidden" });
            return;
        }
        next();
    };
}
