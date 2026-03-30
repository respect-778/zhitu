import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import styles from './index.module.less';
import { useNavigate } from 'react-router';
import { fetchLogin } from '@/store/modules/userStore';
import { useAppDispatch } from '@/store/hooks';
import ParticleBackground from './components/ParticleBackground';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 点击了登录之后触发
  const onFinish = async () => {
    setLoading(true);
    try {
      await dispatch(fetchLogin(form.getFieldsValue())); // 存储 token
      message.success('登录成功！');
      form.resetFields();
      navigate('/');
    } catch (e) {
      console.error('Login failed', e);
      message.error('用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-page ${styles.container}`}>
      <ParticleBackground />
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>加入知途</h1>
          <p className={styles.subtitle}>在碎片信息中，构建属于你的知识网络</p>
        </div>

        <Form
          form={form}
          name="login"
          layout="vertical"
          className={styles.form}
          initialValues={{ remember: true }}
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            label="用户名"
            name="username"
            className={styles.formItem}
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              placeholder="你的用户名"
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            className={styles.formItem}
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              placeholder="••••••••"
            />
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
        <div className={styles.footer}>
          没有账号？ <a href="/register" onClick={(e) => { e.preventDefault(); navigate('/register'); }}>注册一个</a>
        </div>
      </div>
    </div>
  );
};

export default Login;
