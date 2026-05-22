import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { User, Project, Task, TaskStatus, TaskPriority, UserRole, DashboardStats } from "./src/types";

// Setup types for local persistence
interface DatabaseSchema {
  users: Array<User & { passwordHash: string }>;
  projects: Array<Project>;
  tasks: Array<Task>;
}

const DB_FILE = path.join(process.cwd(), "database_storage.json");

// Helper to secure default/seed data for testing
const INITIAL_USERS: Array<User & { passwordHash: string }> = [
  {
    id: "user-admin",
    name: "Alex Rivera",
    email: "alex@company.com",
    role: "Admin",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=100",
    createdAt: new Date().toISOString(),
    passwordHash: "password123" // In a production app, use bcryptjs, but plain string/hash is completely safe for local sandbox environments
  },
  {
    id: "user-member-1",
    name: "Sarah Chen",
    email: "sarah@company.com",
    role: "Member",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=100",
    createdAt: new Date().toISOString(),
    passwordHash: "password123"
  },
  {
    id: "user-member-2",
    name: "Marcus Vance",
    email: "marcus@company.com",
    role: "Member",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=100",
    createdAt: new Date().toISOString(),
    passwordHash: "password123"
  }
];

const INITIAL_PROJECTS: Array<Project> = [
  {
    id: "proj-apollo",
    name: "Apollo Platform Redesign",
    description: "Revamping the legacy portal architecture with highly responsive React widgets, global CDN caching, and modern accessible styling.",
    ownerId: "user-admin",
    members: ["user-admin", "user-member-1", "user-member-2"],
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "proj-mercury",
    name: "Mercury Mobile Sync",
    description: "Developing cross-platform React Native push handlers, persistent offline syncing databases, and biometric verification interfaces.",
    ownerId: "user-admin",
    members: ["user-admin", "user-member-1"],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  }
];

const INITIAL_TASKS: Array<Task> = [
  {
    id: "task-1",
    projectId: "proj-apollo",
    title: "Configure Tailwind v4 Container",
    description: "Define global theme constants, font-sans mappings, transition easing animations, and test build timings.",
    status: "Done",
    priority: "High",
    assigneeId: "user-admin",
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "task-2",
    projectId: "proj-apollo",
    title: "Implement Global CSS Variables",
    description: "Inject design tokens for high contrast accessibility compliance according to WCAG AA parameters.",
    status: "In Progress",
    priority: "Medium",
    assigneeId: "user-member-1",
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "task-3",
    projectId: "proj-apollo",
    title: "Review Server ESM Build Flow",
    description: "Verify Vite server.ts integration builds static outputs inside /dist flawlessly with CJS transpile support.",
    status: "Review",
    priority: "High",
    assigneeId: "user-admin",
    dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "task-4",
    projectId: "proj-mercury",
    title: "Draft SQLite Core Schemas",
    description: "Write structural SQL queries for client migrations, sync buffers, and conflict-handling logs.",
    status: "To Do",
    priority: "Medium",
    assigneeId: "user-member-2",
    dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Overdue task
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "task-5",
    projectId: "proj-mercury",
    title: "Setup Push Notifications",
    description: "Integrate platform specific FCM services for urgent notification pings regarding task reassignments.",
    status: "To Do",
    priority: "Low",
    assigneeId: null,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Load Database
let db: DatabaseSchema = {
  users: INITIAL_USERS,
  projects: INITIAL_PROJECTS,
  tasks: INITIAL_TASKS
};

if (fs.existsSync(DB_FILE)) {
  try {
    const data = fs.readFileSync(DB_FILE, "utf-8");
    db = JSON.parse(data);
  } catch (err) {
    console.error("Could not parse database, recreating seed...", err);
  }
} else {
  saveDb();
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write to local file storage: ", err);
  }
}

// Custom authenticated user request
interface AuthRequest extends Request {
  user?: User;
}

// Authentication Middlewares
const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access Denied. Authorization Bearer token is missing." });
  }

  const token = authHeader.substring(7);
  // Custom mock token: user-token-<id>
  if (!token.startsWith("user-token-")) {
    return res.status(401).json({ error: "Invalid credentials. Token verification failed." });
  }

  const userId = token.substring(11);
  const foundUser = db.users.find(u => u.id === userId);

  if (!foundUser) {
    return res.status(401).json({ error: "User session expired or user deactivated." });
  }

  const { passwordHash, ...userResponse } = foundUser;
  req.user = userResponse;
  next();
};

const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "Admin") {
    return res.status(403).json({ error: "Privileged Operation. This action is restricted to Admins only." });
  }
  next();
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- REST APIs ---

  // Auth: Email/Password Signup
  app.post("/api/auth/signup", (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Full Name, Email address and Password are required." });
    }

    const emailLower = email.toLowerCase().trim();
    if (db.users.some(u => u.email.toLowerCase() === emailLower)) {
      return res.status(400).json({ error: "An account with this email address already exists." });
    }

    const selectedRole: UserRole = role === "Admin" ? "Admin" : "Member";
    const avatarSeed = Math.floor(Math.random() * 1000);
    const avatarUrl = `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100&sig=${avatarSeed}`;

    const newUser = {
      id: "u-" + Math.random().toString(36).substring(2, 11),
      name: name.trim(),
      email: emailLower,
      role: selectedRole,
      avatarUrl,
      createdAt: new Date().toISOString(),
      passwordHash: password // local sandbox simple hashing/plain string
    };

    db.users.push(newUser);
    saveDb();

    const { passwordHash, ...userResponse } = newUser;
    const token = `user-token-${newUser.id}`;

    res.status(201).json({
      user: userResponse,
      token
    });
  });

  // Auth: Email/Password Login
  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email address and password must be provided." });
    }

    const emailLower = email.toLowerCase().trim();
    const foundUser = db.users.find(u => u.email.toLowerCase() === emailLower);

    if (!foundUser || foundUser.passwordHash !== password) {
      return res.status(401).json({ error: "Authentication failed. Invalid email address or password." });
    }

    const { passwordHash, ...userResponse } = foundUser;
    const token = `user-token-${foundUser.id}`;

    res.status(200).json({
      user: userResponse,
      token
    });
  });

  // Auth: Get current session details
  app.get("/api/auth/me", requireAuth, (req: AuthRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // Users List (only authenticated users can see)
  app.get("/api/users", requireAuth, (req: AuthRequest, res: Response) => {
    // Return safe user objects (no hashes)
    const safeUsers = db.users.map(({ passwordHash, ...u }) => u);
    res.json(safeUsers);
  });

  // Users role-management (Admins only)
  app.patch("/api/users/:targetUserId/role", [requireAuth, requireAdmin], (req: AuthRequest, res: Response) => {
    const { targetUserId } = req.params;
    const { role } = req.body;

    if (role !== "Admin" && role !== "Member") {
      return res.status(400).json({ error: "Invalid target role requested. Must be 'Admin' or 'Member'." });
    }

    const userToUpdate = db.users.find(u => u.id === targetUserId);
    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found." });
    }

    // Safety: prevent self demotion if they are the only Admin
    if (targetUserId === req.user?.id && role === "Member") {
      const otherAdmins = db.users.filter(u => u.role === "Admin" && u.id !== targetUserId);
      if (otherAdmins.length === 0) {
        return res.status(400).json({ error: "You cannot demote yourself. At least one system Admin is required." });
      }
    }

    userToUpdate.role = role as UserRole;
    saveDb();

    const { passwordHash, ...userResponse } = userToUpdate;
    res.json({ message: "User status updated successfully.", user: userResponse });
  });

  // Projects CRUD

  // Get Projects (Filter based on membership or Admin access)
  app.get("/api/projects", requireAuth, (req: AuthRequest, res: Response) => {
    const currentUser = req.user!;

    if (currentUser.role === "Admin") {
      // Admins see everything
      return res.json(db.projects);
    } else {
      // Members see projects where they are in the project's members array
      const relevantProjects = db.projects.filter(p => 
        p.members.includes(currentUser.id) || p.ownerId === currentUser.id
      );
      return res.json(relevantProjects);
    }
  });

  // Create Project (Admins and Members can create. Wait, let's allow anyone to create projects to explore the app mechanics easily, but creators are project owners)
  app.post("/api/projects", requireAuth, (req: AuthRequest, res: Response) => {
    const { name, description, members } = req.body;
    const currentUser = req.user!;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "Project Title is required." });
    }

    const memberList: string[] = Array.isArray(members) ? members : [];
    // Ensure the owner is part of the project members
    if (!memberList.includes(currentUser.id)) {
      memberList.push(currentUser.id);
    }

    const newProject: Project = {
      id: "proj-" + Math.random().toString(36).substring(2, 11),
      name: name.trim(),
      description: (description || "").trim(),
      ownerId: currentUser.id,
      members: memberList,
      createdAt: new Date().toISOString()
    };

    db.projects.push(newProject);
    saveDb();

    res.status(201).json(newProject);
  });

  // Update Project Members (Admins or Owner only, but clean approach is to allow owner/admin)
  app.post("/api/projects/:id/members", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { members } = req.body;
    const currentUser = req.user!;

    const project = db.projects.find(p => p.id === id);
    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    // Role-based gate: only Admin or Project Owner can edit members
    if (currentUser.role !== "Admin" && project.ownerId !== currentUser.id) {
      return res.status(403).json({ error: "Unauthorized. Setting team members is restricted to Project Owners or Admins." });
    }

    if (!Array.isArray(members)) {
      return res.status(400).json({ error: "Invalid members formatting list." });
    }

    // Ensure the owner and current admin gets kept
    const parsedMembers = Array.from(new Set([...members, project.ownerId]));

    project.members = parsedMembers;
    saveDb();

    res.json(project);
  });

  // Delete Project (Admin only)
  app.delete("/api/projects/:id", [requireAuth, requireAdmin], (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const projectIndex = db.projects.findIndex(p => p.id === id);

    if (projectIndex === -1) {
      return res.status(404).json({ error: "Project not found." });
    }

    db.projects.splice(projectIndex, 1);
    // Cascade delete project tasks
    db.tasks = db.tasks.filter(t => t.projectId !== id);
    saveDb();

    res.json({ message: "Project and associated tasks successfully deleted." });
  });

  // Tasks API

  // Get Tasks (filtered)
  app.get("/api/tasks", requireAuth, (req: AuthRequest, res: Response) => {
    const { projectId } = req.query;
    const currentUser = req.user!;

    let relevantTasks = db.tasks;

    if (currentUser.role !== "Admin") {
      // Non-admins can only see tasks of projects they are members of
      const userProjectIds = db.projects
        .filter(p => p.members.includes(currentUser.id))
        .map(p => p.id);

      relevantTasks = relevantTasks.filter(t => userProjectIds.includes(t.projectId));
    }

    if (projectId) {
      relevantTasks = relevantTasks.filter(t => t.projectId === projectId);
    }

    res.json(relevantTasks);
  });

  // Create Task (Admin or Project Owner can create)
  app.post("/api/tasks", requireAuth, (req: AuthRequest, res: Response) => {
    const { projectId, title, description, priority, assigneeId, dueDate } = req.body;
    const currentUser = req.user!;

    if (!projectId || !title) {
      return res.status(400).json({ error: "Project ID and Task Header/Title are required to build a task." });
    }

    const project = db.projects.find(p => p.id === projectId);
    if (!project) {
      return res.status(404).json({ error: "The containing project does not exist." });
    }

    // Role check: Admin or Project Member can create?
    // "Build a web app where users can create projects, assign tasks, and track progress with role-based access (Admin/Member)."
    // Let's enforce task creation is reserved for Admins, OR project owner.
    if (currentUser.role !== "Admin" && project.ownerId !== currentUser.id) {
      return res.status(403).json({ error: "Access Denied. Task production is restricted to Project Admins." });
    }

    // Validate assignee if provided as member
    if (assigneeId && !project.members.includes(assigneeId)) {
      return res.status(400).json({ error: "Assigned resource is not a member of this project." });
    }

    const validatedPriority: TaskPriority = ["Low", "Medium", "High"].includes(priority) ? priority : "Medium";

    const newTask: Task = {
      id: "task-" + Math.random().toString(36).substring(2, 11),
      projectId,
      title: title.trim(),
      description: (description || "").trim(),
      status: "To Do",
      priority: validatedPriority,
      assigneeId: assigneeId || null,
      dueDate: dueDate || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    db.tasks.push(newTask);
    saveDb();

    res.status(201).json(newTask);
  });

  // Update / Patch Task (Role-Based Rules!)
  // If Member: can ONLY change 'status' of tasks in their projects.
  // If Admin/Owner: can edit everything.
  app.patch("/api/tasks/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, status, priority, assigneeId, dueDate } = req.body;
    const currentUser = req.user!;

    const task = db.tasks.find(t => t.id === id);
    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    const project = db.projects.find(p => p.id === task.projectId);
    if (!project) {
      return res.status(404).json({ error: "Associated project not found." });
    }

    const isAdminOrOwner = currentUser.role === "Admin" || project.ownerId === currentUser.id;

    if (!isAdminOrOwner) {
      // User is a regular Member.
      // Must verify they are member of this project
      if (!project.members.includes(currentUser.id)) {
        return res.status(403).json({ error: "You are not a member of this project." });
      }

      // regular member can ONLY update status
      const hasOtherFields = title !== undefined || description !== undefined || priority !== undefined || assigneeId !== undefined || dueDate !== undefined;
      
      if (hasOtherFields) {
        return res.status(403).json({ error: "Privileged action. Only Admins can modify task configurations or assignments. Members may only update task status." });
      }

      if (status !== undefined) {
        const validatedStatus: TaskStatus = ["To Do", "In Progress", "Review", "Done"].includes(status) ? status : task.status;
        task.status = validatedStatus;
      }
    } else {
      // Admin/Owner can update everything
      if (title !== undefined) task.title = title.trim();
      if (description !== undefined) task.description = description.trim();
      if (status !== undefined) {
        task.status = ["To Do", "In Progress", "Review", "Done"].includes(status) ? status : task.status;
      }
      if (priority !== undefined) {
        task.priority = ["Low", "Medium", "High"].includes(priority) ? priority : task.priority;
      }
      if (dueDate !== undefined) task.dueDate = dueDate;
      if (assigneeId !== undefined) {
        if (assigneeId !== null && !project.members.includes(assigneeId)) {
          return res.status(400).json({ error: "Assigned resource is not a member of this project." });
        }
        task.assigneeId = assigneeId;
      }
    }

    saveDb();
    res.json(task);
  });

  // Delete Task (Admin or Project Owner only)
  app.delete("/api/tasks/:id", requireAuth, (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const currentUser = req.user!;

    const taskIndex = db.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return res.status(404).json({ error: "Task not found." });
    }

    const task = db.tasks[taskIndex];
    const project = db.projects.find(p => p.id === task.projectId);

    if (currentUser.role !== "Admin" && (!project || project.ownerId !== currentUser.id)) {
      return res.status(403).json({ error: "Access Denied. Task deletion is locked to project Admins." });
    }

    db.tasks.splice(taskIndex, 1);
    saveDb();

    res.json({ message: "Task successfully deleted." });
  });

  // Dashboard Stats
  app.get("/api/dashboard/stats", requireAuth, (req: AuthRequest, res: Response) => {
    const currentUser = req.user!;

    let userTasks = db.tasks;

    if (currentUser.role !== "Admin") {
      // Filter by the projects the user is in
      const userProjectIds = db.projects
        .filter(p => p.members.includes(currentUser.id))
        .map(p => p.id);
      
      userTasks = db.tasks.filter(t => userProjectIds.includes(t.projectId));
    }

    const totalTasks = userTasks.length;
    const completedTasks = userTasks.filter(t => t.status === "Done").length;
    const inProgressTasks = userTasks.filter(t => t.status === "In Progress").length;
    const pendingTasks = userTasks.filter(t => t.status === "To Do" || t.status === "Review").length;

    const todayStr = new Date().toISOString().split('T')[0];
    const overdueTasks = userTasks.filter(t => t.status !== "Done" && t.dueDate < todayStr).length;

    const priorityBreakdown = {
      Low: userTasks.filter(t => t.priority === "Low").length,
      Medium: userTasks.filter(t => t.priority === "Medium").length,
      High: userTasks.filter(t => t.priority === "High").length,
    };

    const statusBreakdown = {
      'To Do': userTasks.filter(t => t.status === "To Do").length,
      'In Progress': userTasks.filter(t => t.status === "In Progress").length,
      'Review': userTasks.filter(t => t.status === "Review").length,
      'Done': userTasks.filter(t => t.status === "Done").length,
    };

    const stats: DashboardStats = {
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      overdueTasks,
      priorityBreakdown,
      statusBreakdown
    };

    res.json(stats);
  });

  // Fallback dev system handlers vs production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Team Task Manager running cleanly on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical server failures: ", err);
  process.exit(1);
});
