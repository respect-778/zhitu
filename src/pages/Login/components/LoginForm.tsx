import React, { useState } from 'react';
import { Button, Form, Input, message } from 'antd';
import { GithubOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { fetchLogin } from '@/store/modules/userStore';
import { useAppDispatch } from '@/store/hooks';
import styles from '../index.module.less';

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async () => {
    setLoading(true);
    try {
      await dispatch(fetchLogin(form.getFieldsValue()));
      message.success('登录成功');
      form.resetFields();
      navigate('/');
    } catch (e) {
      console.error('Login failed', e);
      message.error('邮箱或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.formWrap}>
      <div className={styles.logoBlock}>
        <img style={{ height: '80px' }} src="./imgs/logo.png" alt="logo" draggable={false} />
      </div>

      <div className={styles.header}>
        <h2>欢迎回来</h2>
        <p>登录你的账号，继续探索属于你的知识旅程</p>
      </div>

      <div className={styles.socialGrid}>
        <button type="button" className={styles.socialButton} onClick={() => window.location.href = '/api/oauth/github'}>
          <GithubOutlined />
          使用 GitHub 登录
        </button>
        <button type="button" className={styles.socialButton} onClick={() => window.location.href = '/api/oauth/google'}>
          <GoogleOutlined />
          使用 Google 登录
        </button>
      </div>

      <div className={styles.divider}>
        <span />
        <em>或</em>
        <span />
      </div>

      <Form
        form={form}
        name="login"
        layout="vertical"
        className={styles.form}
        onFinish={onFinish}
        autoComplete="off"
      >
        <Form.Item
          label="邮箱"
          name="email"
          className={styles.formItem}
          rules={[
            { required: true, message: '请输入邮箱' },
            { type: 'email', message: '请输入正确的邮箱格式' }
          ]}
        >
          <Input placeholder="请输入邮箱地址" autoComplete="email" />
        </Form.Item>

        <Form.Item
          label="密码"
          name="password"
          className={styles.formItem}
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password placeholder="请输入密码" autoComplete="current-password" />
        </Form.Item>

        <Form.Item className={styles.submitItem}>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={loading}
            className={styles.submitBtn}
          >
            登录
          </Button>
        </Form.Item>
      </Form>

      <div className={styles.footerLinks}>
        <p>
          还没有账号？
          <button type="button" onClick={() => navigate('/login/register')}>立即注册</button>
        </p>
        <button type="button">忘记密码？</button>
      </div>
    </div>
  );
};

export default LoginForm;
