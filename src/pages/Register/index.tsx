import React, { useState } from 'react';
import { Button, Checkbox, Form, Input, message } from 'antd';
import { GithubOutlined, GoogleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { registerAPI } from '@/api/user';
import { setToken } from '@/store/modules/userStore';
import { getUserInfo } from '@/store/modules/userStore';
import { useAppDispatch } from '@/store/hooks';
import loginStyles from '../Login/index.module.less';
import styles from './index.module.less';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onFinish = async () => {
    setLoading(true);
    try {
      const { username, email, password } = form.getFieldsValue();
      const res = await registerAPI({ username, email, password });
      dispatch(setToken(res.token));
      await dispatch(getUserInfo());
      message.success('注册成功');
      navigate('/');
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '注册失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={loginStyles.formWrap}>
      <div className={loginStyles.logoBlock}>
        <img style={{ height: '80px' }} src="../imgs/logo.png" alt="logo" draggable={false} />
      </div>

      <div className={loginStyles.header}>
        <h2>创建账号</h2>
        <p>填写基础信息，开启你的 Knowvia 知识工作台</p>
      </div>

      <div className={loginStyles.socialGrid}>
        <button type="button" className={loginStyles.socialButton} onClick={() => window.location.href = '/api/oauth/github'}>
          <GithubOutlined />
          使用 GitHub 注册
        </button>
        <button type="button" className={loginStyles.socialButton} onClick={() => window.location.href = '/api/oauth/google'}>
          <GoogleOutlined />
          使用 Google 注册
        </button>
      </div>

      <div className={loginStyles.divider}>
        <span />
        <em>或</em>
        <span />
      </div>

      <Form
        form={form}
        name="register"
        layout="vertical"
        className={loginStyles.form}
        onFinish={onFinish}
        autoComplete="off"
      >
        <Form.Item
          label="用户名"
          name="username"
          className={loginStyles.formItem}
          rules={[{ required: true, message: '请输入用户名' }]}
        >
          <Input placeholder="设置你的用户名" autoComplete="username" />
        </Form.Item>

        <Form.Item
          label="邮箱"
          name="email"
          className={loginStyles.formItem}
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
          className={loginStyles.formItem}
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password placeholder="设置登录密码" autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          label="确认密码"
          name="confirmPassword"
          className={loginStyles.formItem}
          dependencies={['password']}
          rules={[
            { required: true, message: '请再次输入密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('两次输入的密码不一致'));
              }
            })
          ]}
        >
          <Input.Password placeholder="再次输入密码" autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="agreement"
          valuePropName="checked"
          className={styles.agreementItem}
          rules={[
            {
              validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('请先同意用户协议'))
            }
          ]}
        >
          <Checkbox>
            我已阅读并同意 <button type="button">用户协议</button> 和 <button type="button">隐私政策</button>
          </Checkbox>
        </Form.Item>

        <Form.Item className={loginStyles.submitItem}>
          <Button type="primary" htmlType="submit" block loading={loading} className={loginStyles.submitBtn}>
            注册
          </Button>
        </Form.Item>
      </Form>

      <div className={loginStyles.footerLinks}>
        <p>
          已经有账号？
          <button type="button" onClick={() => navigate('/login')}>立即登录</button>
        </p>
        <button type="button">需要帮助？</button>
      </div>
    </div>
  );
};

export default Register;
