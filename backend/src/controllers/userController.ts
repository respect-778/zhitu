import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/User';
import { FollowModel } from '../models/Follow';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  clearRefreshTokenCookie,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenFromRequest,
  isRefreshSessionExpired,
  setRefreshTokenCookie,
  verifyRefreshToken
} from '../utils/authToken';

export class UserController {
  // User login
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json(ResponseUtil.error('邮箱和密码不能为空'));
        return;
      }

      const user = await UserModel.findByEmail(email);
      if (!user || !user.password) {
        res.status(401).json(ResponseUtil.error('邮箱或密码错误'));
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        res.status(401).json(ResponseUtil.error('邮箱或密码错误'));
        return;
      }

      const accessToken = generateAccessToken(user.id);
      const refreshToken = generateRefreshToken(user.id);
      setRefreshTokenCookie(res, refreshToken);

      res.json(ResponseUtil.login(accessToken, '登录成功'));
    } catch (error) {
      console.error('登录错误:', error);
      res.status(500).json(ResponseUtil.error('登录失败，请稍后重试'));
    }
  }

  // User register
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        res.status(400).json(ResponseUtil.error('用户名、邮箱和密码不能为空'));
        return;
      }

      const existingEmail = await UserModel.findByEmail(email);
      if (existingEmail) {
        res.status(400).json(ResponseUtil.error('该邮箱已被注册'));
        return;
      }

      const existingUser = await UserModel.findByUsername(username);
      if (existingUser) {
        res.status(400).json(ResponseUtil.error('用户名已存在'));
        return;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const userId = await UserModel.create({
        username,
        email,
        password: hashedPassword
      });

      const accessToken = generateAccessToken(userId);
      const refreshToken = generateRefreshToken(userId);
      setRefreshTokenCookie(res, refreshToken);

      res.status(201).json(ResponseUtil.login(accessToken, '注册成功'));
    } catch (error) {
      console.error('注册错误:', error);
      res.status(500).json(ResponseUtil.error('注册失败，请稍后重试'));
    }
  }

  // Get user info
  static async getUserInfo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const user = await UserModel.findById(userId);
      if (!user) {
        res.status(404).json(ResponseUtil.error('用户不存在'));
        return;
      }

      const stats = await UserModel.getStats(userId);

      const userInfo = {
        id: user.id.toString(),
        username: user.username,
        email: user.email || '',
        avatar: user.avatar || '',
        mobile: user.mobile || '',
        gender: user.gender,
        birthday: user.birthday || '',
        degree: user.degree || '',
        bio: user.bio || '',
        art_count: stats.art_count,
        follow_count: stats.follow_count,
        fans_count: stats.fans_count,
        like_count: stats.like_count,
        community_count: stats.comments_count,
        favorites_count: stats.favorites_count
      };

      res.json(ResponseUtil.success('获取成功', userInfo));
    } catch (error) {
      console.error('获取用户信息错误:', error);
      res.status(500).json(ResponseUtil.error('获取用户信息失败'));
    }
  }

  // Update user info
  static async updateUserInfo(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json(ResponseUtil.error('未授权'));
        return;
      }

      const { username, mobile, gender, birthday, degree, avatar, bio } = req.body;

      const success = await UserModel.update(userId, {
        username,
        mobile,
        gender,
        birthday: birthday ? new Date(birthday).toISOString().split('T')[0] : null,
        degree,
        avatar,
        bio
      });

      if (success) {
        res.json(ResponseUtil.success('更新成功'));
      } else {
        res.status(400).json(ResponseUtil.error('更新失败'));
      }
    } catch (error) {
      console.error('更新用户信息错误:', error);
      res.status(500).json(ResponseUtil.error('更新用户信息失败'));
    }
  }

  // Refresh access token by refresh token cookie
  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      if (!refreshToken) {
        res.status(401).json(ResponseUtil.error('未提供 refresh token'));
        return;
      }

      const decoded = verifyRefreshToken(refreshToken);
      if (isRefreshSessionExpired(decoded)) {
        clearRefreshTokenCookie(res);
        res.status(401).json(ResponseUtil.error('会话已超过最大登录时长，请重新登录'));
        return;
      }

      const user = await UserModel.findById(decoded.userId);
      if (!user) {
        clearRefreshTokenCookie(res);
        res.status(401).json(ResponseUtil.error('用户不存在'));
        return;
      }

      const newAccessToken = generateAccessToken(decoded.userId);
      const newRefreshToken = generateRefreshToken(decoded.userId, decoded.sessionExp);
      setRefreshTokenCookie(res, newRefreshToken);

      res.json(ResponseUtil.login(newAccessToken, '刷新成功'));
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError || error instanceof jwt.JsonWebTokenError) {
        clearRefreshTokenCookie(res);
        res.status(401).json(ResponseUtil.error('refresh token 已过期或无效'));
      } else {
        console.error('刷新 token 错误:', error);
        res.status(500).json(ResponseUtil.error('刷新 token 失败'));
      }
    }
  }

  // Get public user profile by id
  static async getUserProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const targetId = parseInt(req.params.id);
      if (!targetId || isNaN(targetId)) {
        res.status(400).json(ResponseUtil.error('无效的用户 ID'));
        return;
      }

      const user = await UserModel.findById(targetId);
      if (!user) {
        res.status(404).json(ResponseUtil.error('用户不存在'));
        return;
      }

      const stats = await UserModel.getStats(targetId);

      // 判断当前登录用户是否已关注此人
      let isFollowed = false;
      if (req.userId && req.userId !== targetId) {
        isFollowed = await FollowModel.exists(req.userId, targetId);
      }

      const profile = {
        id: user.id,
        username: user.username,
        avatar: user.avatar || '',
        bio: user.bio || '',
        art_count: stats.art_count,
        fans_count: stats.fans_count,
        follow_count: stats.follow_count,
        like_count: stats.like_count,
        isFollowed
      };

      res.json(ResponseUtil.success('获取成功', profile));
    } catch (error) {
      console.error('获取用户资料错误:', error);
      res.status(500).json(ResponseUtil.error('获取用户资料失败'));
    }
  }

  // Logout and clear refresh token cookie
  static async logout(req: Request, res: Response): Promise<void> {
    clearRefreshTokenCookie(res);
    res.json(ResponseUtil.success('退出登录成功'));
  }
}
