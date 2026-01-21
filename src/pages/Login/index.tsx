import React from 'react';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, ArrowRightOutlined } from '@ant-design/icons';
import styles from './index.module.less';
import { useNavigate } from 'react-router';
import { fetchLogin } from '@/store/modules/userStore';
import { useAppDispatch } from '@/store/hooks';

const Login: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [form] = Form.useForm();

  // 点击了登录之后触发
  const onFinish = async () => {
    await dispatch(fetchLogin(form.getFieldsValue())) // 存储 token
    message.success('登录成功！');
    form.resetFields();
    navigate('/')
  };

  return (
    <div className={`login-page ${styles.container}`}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>知途</h1>
          <p className={styles.subtitle}>在碎片信息中，走出属于自己的清晰道路！</p>
        </div>

        <Form
          form={form}
          name="login"
          className={styles.form}
          initialValues={{ remember: true }}
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            className={styles.inputWrapper}
            rules={[{ required: true, message: '请输入用户名！' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#aaa', fontSize: 18, padding: '8px 5px' }} />}
              placeholder="输入用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            className={styles.inputWrapper}
            rules={[{ required: true, message: '请输入密码！' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#aaa', fontSize: 18, padding: '8px 5px' }} />}
              placeholder="输入密码"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32 }}>
            <Button type="primary" htmlType="submit" block icon={<ArrowRightOutlined />}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};

export default Login;
